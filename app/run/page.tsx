'use client';
import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const ALL_ORGS = [
  'CEEW','CSE India','WRI India','CSTEP','Air Pollution Action Group','Chintan',
  'IIT Delhi','IIT Kanpur','Health Effects Institute','ICCT',
  'EPIC India','Climate Trends','Sustainable Futures Collaborative',
];
const ORG_COLORS = ['ef4444','f97316','eab308','84cc16','22c55e','10b981','14b8a6','06b6d4','3b82f6','6366f1','a855f7','ec4899','f43f5e'];

type LogLine = { msg: string; level: string };

export default function RunPage() {
  const [selectedOrgs, setSelectedOrgs]   = useState<string[]>([]);
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState(() => new Date().toISOString().slice(0,10));
  const [running, setRunning]             = useState(false);
  const [logs, setLogs]                   = useState<LogLine[]>([]);
  const [done, setDone]                   = useState(false);
  const [htmlB64, setHtmlB64]             = useState('');
  const [error, setError]                 = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const toggleOrg = (org: string) =>
    setSelectedOrgs(prev => prev.includes(org) ? prev.filter(o => o !== org) : [...prev, org]);

  const startRun = async () => {
    if (!selectedOrgs.length) { setError('Select at least one organisation'); return; }
    if (!dateFrom)            { setError('Select a start date'); return; }
    setError(''); setLogs([]); setDone(false); setHtmlB64(''); setRunning(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgs: selectedOrgs, dateFrom, dateTo }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) { throw new Error(`HTTP ${res.status}`); }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const lines = part.split('\n');
          const eventLine = lines.find(l => l.startsWith('event:'));
          const dataLine  = lines.find(l => l.startsWith('data:'));
          const event     = eventLine?.slice(6).trim();
          const raw       = dataLine?.slice(5).trim();
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            if (event === 'log')   setLogs(prev => [...prev, { msg: obj.msg, level: obj.level || 'info' }]);
            if (event === 'error') { setError(obj.msg); setRunning(false); }
            if (event === 'done')  { setHtmlB64(obj.htmlB64); setDone(true); setRunning(false); }
          } catch {}
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Run failed');
      setRunning(false);
    }
  };

  const downloadReport = () => {
    if (!htmlB64) return;
    const html = atob(htmlB64);
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `aq-report-${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openReport = () => {
    if (!htmlB64) return;
    const html = atob(htmlB64);
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const signOut = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = '/login';
  };

  const logColor = (level: string) => {
    if (level === 'ok')   return '#4caf74';
    if (level === 'warn') return '#d4a017';
    if (level === 'error') return '#e05c5c';
    return '#8fa3b8';
  };

  // Today for max date
  const today = new Date().toISOString().slice(0,10);

  return (
    <div style={{ minHeight:'100vh', background:'#0a0e17', color:'#d8e4f0', fontFamily:'Inter,sans-serif', padding:'0 0 80px' }}>

      {/* Topbar */}
      <div style={{ background:'#111520', borderBottom:'1px solid #252d40', padding:'14px 32px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'#c9922a' }}>Emerald AI</div>
          <div style={{ fontSize:12, color:'#5e7494' }}>AQ Intelligence Platform</div>
        </div>
        <button onClick={signOut} style={{ background:'transparent', border:'1px solid #252d40', color:'#5e7494', borderRadius:5, padding:'6px 14px', fontSize:12, cursor:'pointer' }}>Sign out</button>
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', padding:'40px 24px 0' }}>

        {/* Title */}
        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:'#c9922a', marginBottom:8, fontFamily:'monospace' }}>Air Quality Intelligence</div>
          <h1 style={{ fontFamily:'DM Serif Display,serif', fontSize:34, fontWeight:400, color:'#d8e4f0', lineHeight:1.2, marginBottom:8 }}>Generate Report</h1>
          <p style={{ fontSize:13, color:'#5e7494' }}>Select organisations and a date range, then click Generate to run the full AQ intelligence pipeline.</p>
        </div>

        {/* Step 1: Orgs */}
        <div style={{ background:'#111520', border:'1px solid #252d40', borderRadius:10, padding:'20px 22px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#c9922a', marginBottom:14 }}>Step 1 — Select Organisations</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
            {ALL_ORGS.map((org, i) => {
              const sel = selectedOrgs.includes(org);
              const col = '#' + ORG_COLORS[i];
              return (
                <button key={org} onClick={() => toggleOrg(org)}
                  style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'6px 13px', borderRadius:5, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s',
                    background: sel ? col + '22' : '#1e2638',
                    border: sel ? `1.5px solid ${col}88` : '1.5px solid #252d40',
                    color: sel ? col : '#8fa3b8' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: sel ? col : '#3a4a5e', flexShrink:0 }}/>
                  {org}
                </button>
              );
            })}
          </div>
          {selectedOrgs.length > 0 && (
            <div style={{ marginTop:12, fontSize:12, color:'#5e7494' }}>
              {selectedOrgs.length} selected · <button onClick={() => setSelectedOrgs([])} style={{ background:'none', border:'none', color:'#c9922a', cursor:'pointer', fontSize:12, padding:0 }}>clear all</button>
              <button onClick={() => setSelectedOrgs([...ALL_ORGS])} style={{ background:'none', border:'none', color:'#c9922a', cursor:'pointer', fontSize:12, padding:'0 0 0 10px' }}>select all</button>
            </div>
          )}
        </div>

        {/* Step 2: Date Range */}
        <div style={{ background:'#111520', border:'1px solid #252d40', borderRadius:10, padding:'20px 22px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#c9922a', marginBottom:14 }}>Step 2 — Date Range</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <div>
              <label style={{ fontSize:11, color:'#5e7494', display:'block', marginBottom:4 }}>From</label>
              <input type="date" value={dateFrom} max={today}
                onChange={e => setDateFrom(e.target.value)}
                style={{ background:'#1e2638', border:'1px solid #252d40', borderRadius:5, color:'#d8e4f0', padding:'8px 12px', fontSize:13, fontFamily:'monospace' }}/>
            </div>
            <div>
              <label style={{ fontSize:11, color:'#5e7494', display:'block', marginBottom:4 }}>To</label>
              <input type="date" value={dateTo} max={today}
                onChange={e => setDateTo(e.target.value)}
                style={{ background:'#1e2638', border:'1px solid #252d40', borderRadius:5, color:'#d8e4f0', padding:'8px 12px', fontSize:13, fontFamily:'monospace' }}/>
            </div>
            <div style={{ display:'flex', gap:8, alignSelf:'flex-end' }}>
              {[['7d','Last 7d',7],['30d','Last 30d',30],['90d','Last 90d',90]].map(([k, lbl, n]) => (
                <button key={k} onClick={() => {
                  const to = new Date(); const from = new Date(to);
                  from.setDate(from.getDate() - Number(n));
                  setDateFrom(from.toISOString().slice(0,10));
                  setDateTo(to.toISOString().slice(0,10));
                }} style={{ background:'#1e2638', border:'1px solid #252d40', color:'#8fa3b8', borderRadius:5, padding:'8px 12px', fontSize:12, cursor:'pointer' }}>{lbl}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:'rgba(224,92,92,.1)', border:'1px solid rgba(224,92,92,.3)', borderRadius:6, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#e05c5c' }}>
            {error}
          </div>
        )}

        {/* Generate button */}
        {!running && !done && (
          <button onClick={startRun} disabled={running}
            style={{ background:'#c9922a', border:'none', color:'#0a0e17', borderRadius:6, padding:'13px 28px', fontSize:14, fontWeight:700, cursor:'pointer', width:'100%', letterSpacing:'.04em' }}>
            Generate AQ Intelligence Report
          </button>
        )}

        {/* Log stream */}
        {(running || logs.length > 0) && (
          <div style={{ background:'#0a0e17', border:'1px solid #252d40', borderRadius:8, padding:'14px 16px', marginTop:16, maxHeight:420, overflowY:'auto', fontFamily:'monospace', fontSize:11 }}>
            <div style={{ fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:'#3a4a5e', marginBottom:10 }}>Pipeline Log</div>
            {logs.map((line, i) => (
              <div key={i} style={{ color: logColor(line.level), lineHeight:1.7, borderBottom:i < logs.length-1 ? '1px solid #0d1220' : 'none', padding:'1px 0' }}>
                {line.level === 'ok' ? '✓ ' : line.level === 'warn' ? '⚠ ' : line.level === 'error' ? '✗ ' : '  '}{line.msg}
              </div>
            ))}
            {running && (
              <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:8 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'#c9922a', animation:'pulse 1.5s infinite' }}/>
                <span style={{ color:'#3a4a5e' }}>Running…</span>
              </div>
            )}
            <div ref={logEndRef}/>
          </div>
        )}

        {/* Done panel */}
        {done && (
          <div style={{ background:'rgba(76,175,116,.07)', border:'1px solid rgba(76,175,116,.3)', borderRadius:10, padding:'24px', marginTop:16 }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#4caf74', marginBottom:6 }}>Report ready</div>
            <div style={{ fontSize:13, color:'#8fa3b8', marginBottom:20 }}>Your AQ Intelligence Report has been generated. Open it in a new tab or download the HTML file.</div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <button onClick={openReport}
                style={{ background:'#c9922a', border:'none', color:'#0a0e17', borderRadius:6, padding:'11px 22px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Open Report
              </button>
              <button onClick={downloadReport}
                style={{ background:'transparent', border:'1px solid rgba(201,146,42,.5)', color:'#c9922a', borderRadius:6, padding:'11px 22px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Download HTML
              </button>
              <button onClick={() => { setDone(false); setLogs([]); setHtmlB64(''); setSelectedOrgs([]); }}
                style={{ background:'transparent', border:'1px solid #252d40', color:'#5e7494', borderRadius:6, padding:'11px 22px', fontSize:13, cursor:'pointer' }}>
                New Report
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @media (max-width: 600px) {
          .run-date-row { flex-direction: column !important; }
        }
      `}</style>
    </div>
  );
}
