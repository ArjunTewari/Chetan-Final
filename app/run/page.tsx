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
type SectionCard = { id: string; title: string; summary: string; step: number };
type Mode = 'stepwise' | 'full';

export default function RunPage() {
  const today = new Date().toISOString().slice(0, 10);

  // Form
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState(today);
  const [mode, setMode]                 = useState<Mode>('stepwise');

  // Run
  const [running, setRunning]       = useState(false);
  const [logs, setLogs]             = useState<LogLine[]>([]);
  const [sections, setSections]     = useState<SectionCard[]>([]);
  const [shownCount, setShownCount] = useState(0);
  const [runId, setRunId]           = useState<string | null>(null);
  const [done, setDone]             = useState(false);
  const [htmlB64, setHtmlB64]       = useState('');
  const [error, setError]           = useState('');

  // UI toggles
  const [editMode, setEditMode]       = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showLogs, setShowLogs]       = useState(true);

  const iframeRef        = useRef<HTMLIFrameElement>(null);
  const logEndRef        = useRef<HTMLDivElement>(null);
  const abortRef         = useRef<AbortController | null>(null);
  const blobUrlRef       = useRef<string>('');
  const waitingForNext   = useRef(false);

  // Auto-scroll logs
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // Load iframe once htmlB64 is set — use TextDecoder to preserve UTF-8 characters
  useEffect(() => {
    if (!htmlB64) return;
    const bytes = Uint8Array.from(atob(htmlB64), c => c.charCodeAt(0));
    const html  = new TextDecoder('utf-8').decode(bytes);
    const blob  = new Blob([html], { type: 'text/html; charset=utf-8' });
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    if (iframeRef.current) iframeRef.current.src = url;
  }, [htmlB64]);

  const toggleOrg = (org: string) =>
    setSelectedOrgs(prev => prev.includes(org) ? prev.filter(o => o !== org) : [...prev, org]);

  const startRun = async () => {
    if (!selectedOrgs.length) { setError('Select at least one organisation'); return; }
    if (!dateFrom) { setError('Select a start date'); return; }
    setError(''); setLogs([]); setSections([]); setShownCount(0);
    setRunId(null); setDone(false); setHtmlB64(''); setEditMode(false); setRunning(true);
    waitingForNext.current = false;

    const capturedMode = mode;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgs: selectedOrgs, dateFrom, dateTo, mode }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const lines = part.split('\n');
          const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
          const raw   = lines.find(l => l.startsWith('data:'))?.slice(5).trim();
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            if (event === 'init') {
              setRunId(obj.runId);
            } else if (event === 'log') {
              setLogs(prev => [...prev, { msg: obj.msg, level: obj.level || 'info' }]);
            } else if (event === 'section') {
              setSections(prev => {
                const next = [...prev, obj as SectionCard];
                // Full mode: reveal all. Stepwise: reveal first, or if user already approved (waitingForNext).
                if (capturedMode === 'full' || prev.length === 0 || waitingForNext.current) {
                  setShownCount(next.length);
                  waitingForNext.current = false;
                }
                return next;
              });
            } else if (event === 'error') {
              if (obj.msg === 'PIPELINE_ABORTED') {
                setLogs(prev => [...prev, { msg: 'Report generation aborted.', level: 'warn' }]);
              } else {
                setError(obj.msg);
              }
              setRunning(false);
            } else if (event === 'done') {
              setHtmlB64(obj.htmlB64); setDone(true); setRunning(false);
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Run failed');
      setRunning(false);
    }
  };

  const abortRun = async () => {
    if (runId) {
      try {
        await fetch('/api/run/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId }),
        });
      } catch {}
    }
    abortRef.current?.abort();
    setRunning(false);
    setLogs(prev => [...prev, { msg: 'Report generation aborted by user.', level: 'warn' }]);
  };

  const approveSection = async () => {
    const currentSection = sections[shownCount - 1];
    if (!currentSection) return;

    // Signal the server to continue past this section
    if (runId) {
      try {
        await fetch('/api/run/approve', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ runId, step: currentSection.step }),
        });
      } catch {}
    }

    // If next section already buffered, reveal it; otherwise wait for SSE to deliver it
    if (shownCount < sections.length) {
      setShownCount(prev => prev + 1);
    } else {
      waitingForNext.current = true;
    }
  };

  const toggleEditMode = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    if (!editMode) {
      doc.querySelectorAll('.sec').forEach(el => {
        (el as HTMLElement).contentEditable = 'true';
        (el as HTMLElement).style.outline = '2px dashed rgba(201,146,42,.45)';
        (el as HTMLElement).style.outlineOffset = '6px';
      });
      setEditMode(true);
    } else {
      doc.querySelectorAll('[contenteditable="true"]').forEach(el => {
        (el as HTMLElement).contentEditable = 'false';
        (el as HTMLElement).style.outline = '';
        (el as HTMLElement).style.outlineOffset = '';
      });
      setEditMode(false);
    }
  };

  const downloadReport = (type: 'full' | 'client') => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    setShowDownload(false);

    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    // Strip edit mode markers
    clone.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      (el as HTMLElement).style.outline = '';
      (el as HTMLElement).style.outlineOffset = '';
    });

    if (type === 'client') {
      // Remove the Action Matrix section and its nav link
      clone.querySelector('#actions')?.remove();
      clone.querySelector('a[href="#actions"]')?.remove();
    }

    const html = '<!DOCTYPE html>' + clone.outerHTML;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `aq-report-${type}-${today}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setDone(false); setLogs([]); setSections([]); setShownCount(0);
    setRunId(null); setHtmlB64(''); setSelectedOrgs([]); setEditMode(false); setError('');
    waitingForNext.current = false;
  };

  const signOut = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = '/login';
  };

  const logColor = (level: string) =>
    level === 'ok' ? '#4caf74' : level === 'warn' ? '#d4a017' : level === 'error' ? '#e05c5c' : '#8fa3b8';

  const visibleSections = sections.slice(0, shownCount);
  const canContinue     = shownCount < sections.length;
  const isWaiting       = running && !canContinue && shownCount > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e17', color: '#d8e4f0', fontFamily: 'Inter,sans-serif', padding: '0 0 100px' }}>

      {/* Topbar */}
      <div style={{ background: '#111520', borderBottom: '1px solid #252d40', padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#c9922a' }}>Emerald AI</div>
          <div style={{ fontSize: 12, color: '#5e7494' }}>AQ Intelligence Platform</div>
        </div>
        <button onClick={signOut} style={{ background: 'transparent', border: '1px solid #252d40', color: '#5e7494', borderRadius: 5, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>Sign out</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 0' }}>

        {/* Page title */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#c9922a', marginBottom: 8, fontFamily: 'monospace' }}>Air Quality Intelligence</div>
          <h1 style={{ fontFamily: 'DM Serif Display,serif', fontSize: 34, fontWeight: 400, color: '#d8e4f0', lineHeight: 1.2, marginBottom: 8 }}>Generate Report</h1>
          <p style={{ fontSize: 13, color: '#5e7494' }}>Select organisations and a date range, then click Generate to run the full AQ intelligence pipeline.</p>
        </div>

        {/* ── FORM (hidden while running or done) ── */}
        {!running && !done && (<>

          {/* Step 1: Organisations */}
          <div style={{ background: '#111520', border: '1px solid #252d40', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c9922a', marginBottom: 14 }}>Step 1 — Select Organisations</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {ALL_ORGS.map((org, i) => {
                const sel = selectedOrgs.includes(org);
                const col = '#' + ORG_COLORS[i];
                return (
                  <button key={org} onClick={() => toggleOrg(org)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                      background: sel ? col + '22' : '#1e2638', border: sel ? `1.5px solid ${col}88` : '1.5px solid #252d40', color: sel ? col : '#8fa3b8' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: sel ? col : '#3a4a5e', flexShrink: 0 }}/>
                    {org}
                  </button>
                );
              })}
            </div>
            {selectedOrgs.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#5e7494' }}>
                {selectedOrgs.length} selected ·{' '}
                <button onClick={() => setSelectedOrgs([])} style={{ background: 'none', border: 'none', color: '#c9922a', cursor: 'pointer', fontSize: 12, padding: 0 }}>clear</button>
                {' · '}
                <button onClick={() => setSelectedOrgs([...ALL_ORGS])} style={{ background: 'none', border: 'none', color: '#c9922a', cursor: 'pointer', fontSize: 12, padding: 0 }}>select all</button>
              </div>
            )}
          </div>

          {/* Step 2: Date Range */}
          <div style={{ background: '#111520', border: '1px solid #252d40', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c9922a', marginBottom: 14 }}>Step 2 — Date Range</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: 11, color: '#5e7494', display: 'block', marginBottom: 4 }}>From</label>
                <input type="date" value={dateFrom} max={today} onChange={e => setDateFrom(e.target.value)}
                  style={{ background: '#1e2638', border: '1px solid #252d40', borderRadius: 5, color: '#d8e4f0', padding: '8px 12px', fontSize: 13, fontFamily: 'monospace' }}/>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#5e7494', display: 'block', marginBottom: 4 }}>To</label>
                <input type="date" value={dateTo} max={today} onChange={e => setDateTo(e.target.value)}
                  style={{ background: '#1e2638', border: '1px solid #252d40', borderRadius: 5, color: '#d8e4f0', padding: '8px 12px', fontSize: 13, fontFamily: 'monospace' }}/>
              </div>
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                {[['7d','Last 7d',7],['30d','Last 30d',30],['90d','Last 90d',90]].map(([k,lbl,n]) => (
                  <button key={k} onClick={() => {
                    const to = new Date(), from = new Date(to);
                    from.setDate(from.getDate() - Number(n));
                    setDateFrom(from.toISOString().slice(0,10));
                    setDateTo(to.toISOString().slice(0,10));
                  }} style={{ background: '#1e2638', border: '1px solid #252d40', color: '#8fa3b8', borderRadius: 5, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>{lbl}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3: Mode */}
          <div style={{ background: '#111520', border: '1px solid #252d40', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c9922a', marginBottom: 14 }}>Step 3 — Generation Mode</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {([
                ['stepwise', 'Step-by-Step', 'Preview and approve each section before the next is revealed — pause and review at your own pace'],
                ['full',     'Full Report',  'Generate all sections at once — bypass the section-by-section review flow'],
              ] as const).map(([val, label, desc]) => (
                <button key={val} onClick={() => setMode(val)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '14px 18px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all .15s', flex: '1 1 220px',
                    background: mode === val ? 'rgba(201,146,42,.1)' : '#1e2638',
                    border: `1.5px solid ${mode === val ? 'rgba(201,146,42,.5)' : '#252d40'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${mode === val ? '#c9922a' : '#3a4a5e'}`, background: mode === val ? '#c9922a' : 'transparent', flexShrink: 0 }}/>
                    <span style={{ fontSize: 13, fontWeight: 700, color: mode === val ? '#c9922a' : '#d8e4f0' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#5e7494', paddingLeft: 23, lineHeight: 1.5 }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(224,92,92,.1)', border: '1px solid rgba(224,92,92,.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#e05c5c' }}>{error}</div>
          )}

          <button onClick={startRun}
            style={{ background: '#c9922a', border: 'none', color: '#0a0e17', borderRadius: 6, padding: '13px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%', letterSpacing: '.04em' }}>
            Generate AQ Intelligence Report
          </button>
        </>)}

        {/* ── PIPELINE PROGRESS ── */}
        {(running || sections.length > 0) && (

          <div>
            {/* Abort banner shown while running */}
            {running && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(224,92,92,.07)', border: '1px solid rgba(224,92,92,.2)', borderRadius: 8, padding: '10px 16px', marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e05c5c', animation: 'pulse 1.5s infinite', flexShrink: 0 }}/>
                  <span style={{ fontSize: 12, color: '#8fa3b8' }}>Pipeline running — you can abort at any time</span>
                </div>
                <button onClick={abortRun}
                  style={{ background: 'rgba(224,92,92,.15)', border: '1px solid rgba(224,92,92,.4)', color: '#e05c5c', borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '.03em' }}>
                  ✕ Abort
                </button>
              </div>
            )}

            {/* Collapsible log stream */}
            {logs.length > 0 && (
              <div style={{ background: '#0a0e17', border: '1px solid #252d40', borderRadius: 8, marginTop: 10, overflow: 'hidden' }}>
                <button onClick={() => setShowLogs(p => !p)}
                  style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit',
                    borderBottom: showLogs ? '1px solid #1a2030' : 'none' }}>
                  <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#3a4a5e', fontFamily: 'monospace' }}>Pipeline Log · {logs.length} lines</span>
                  <span style={{ fontSize: 10, color: '#3a4a5e' }}>{showLogs ? '▲ collapse' : '▼ expand'}</span>
                </button>
                {showLogs && (
                  <div style={{ padding: '12px 14px', maxHeight: 240, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                    {logs.map((l, i) => (
                      <div key={i} style={{ color: logColor(l.level), lineHeight: 1.7 }}>
                        {l.level === 'ok' ? '✓ ' : l.level === 'warn' ? '⚠ ' : l.level === 'error' ? '✗ ' : '  '}{l.msg}
                      </div>
                    ))}
                    {running && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#c9922a', animation: 'pulse 1.5s infinite' }}/>
                        <span style={{ color: '#3a4a5e' }}>Running…</span>
                      </div>
                    )}
                    <div ref={logEndRef}/>
                  </div>
                )}
              </div>
            )}

            {/* Section cards */}
            {visibleSections.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c9922a', marginBottom: 12 }}>
                  Section Review
                  {mode === 'stepwise' && sections.length > 0 && (
                    <span style={{ fontWeight: 400, color: '#5e7494', marginLeft: 8 }}>
                      {shownCount}/{sections.length} shown
                      {sections.length - shownCount > 0 ? ` · ${sections.length - shownCount} pending` : ' · all revealed'}
                    </span>
                  )}
                </div>

                {visibleSections.map((sec, idx) => {
                  const isLast     = idx === visibleSections.length - 1;
                  const isPending  = mode === 'stepwise' && isLast;

                  if (isPending) {
                    // Current section awaiting approval (amber card)
                    return (
                      <div key={sec.id} style={{ background: 'rgba(201,146,42,.07)', border: '1.5px solid rgba(201,146,42,.3)', borderRadius: 10, padding: '18px 20px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#c9922a', animation: 'pulse 1.5s infinite', flexShrink: 0 }}/>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#c9922a' }}>{sec.title}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#8fa3b8', lineHeight: 1.7, marginBottom: 14 }}>{sec.summary}</div>
                        {canContinue ? (
                          <button onClick={approveSection}
                            style={{ background: '#c9922a', border: 'none', color: '#0a0e17', borderRadius: 5, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Approve &amp; Continue →
                          </button>
                        ) : isWaiting ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#5e7494' }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#5e7494', animation: 'pulse 1.5s infinite' }}/>
                            Waiting for next section from pipeline…
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#4caf74' }}>✓ All sections generated — scroll down to view and download</div>
                        )}
                      </div>
                    );
                  }

                  // Approved / past section (green compact card)
                  return (
                    <div key={sec.id} style={{ background: '#111520', border: '1px solid #252d40', borderRadius: 8, padding: '11px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ color: '#4caf74', fontSize: 14, flexShrink: 0 }}>✓</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#8fa3b8' }}>{sec.title}</div>
                        <div style={{ fontSize: 11, color: '#3a4a5e', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{sec.summary}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── REPORT PANEL (after done) ── */}
        {done && (
          <div style={{ marginTop: 24 }}>

            {/* Controls bar */}
            <div style={{ background: 'rgba(76,175,116,.07)', border: '1px solid rgba(76,175,116,.3)', borderRadius: 10, padding: '18px 22px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#4caf74' }}>Report ready</div>
                  <div style={{ fontSize: 12, color: '#5e7494', marginTop: 3 }}>
                    {editMode
                      ? 'Click any section in the preview below to edit its text directly.'
                      : 'Preview your report below. Click Edit to make inline changes before downloading.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

                  {/* Edit toggle */}
                  <button onClick={toggleEditMode}
                    style={{ background: editMode ? 'rgba(201,146,42,.15)' : '#1e2638', border: `1px solid ${editMode ? 'rgba(201,146,42,.4)' : '#252d40'}`, color: editMode ? '#c9922a' : '#8fa3b8', borderRadius: 5, padding: '7px 13px', fontSize: 12, cursor: 'pointer', fontWeight: editMode ? 700 : 400 }}>
                    {editMode ? '✏ Exit Edit Mode' : '✏ Edit Sections'}
                  </button>

                  {/* Download dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowDownload(p => !p)}
                      style={{ background: '#c9922a', border: 'none', color: '#0a0e17', borderRadius: 5, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Download ▾
                    </button>
                    {showDownload && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, background: '#111520', border: '1px solid #252d40', borderRadius: 8, overflow: 'hidden', zIndex: 200, minWidth: 240, boxShadow: '0 6px 24px rgba(0,0,0,.5)' }}>
                        <button onClick={() => downloadReport('full')}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#d8e4f0', padding: '12px 16px', fontSize: 12, cursor: 'pointer' }}>
                          <div style={{ fontWeight: 700 }}>Personal / Full Report</div>
                          <div style={{ fontSize: 11, color: '#5e7494', marginTop: 2 }}>All sections including Action Matrix</div>
                        </button>
                        <div style={{ height: 1, background: '#252d40' }}/>
                        <button onClick={() => downloadReport('client')}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#d8e4f0', padding: '12px 16px', fontSize: 12, cursor: 'pointer' }}>
                          <div style={{ fontWeight: 700 }}>Client Sharing</div>
                          <div style={{ fontSize: 11, color: '#5e7494', marginTop: 2 }}>Action Matrix excluded</div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* New report */}
                  <button onClick={resetAll}
                    style={{ background: 'transparent', border: '1px solid #252d40', color: '#5e7494', borderRadius: 5, padding: '7px 13px', fontSize: 12, cursor: 'pointer' }}>
                    New Report
                  </button>
                </div>
              </div>

              {editMode && (
                <div style={{ background: 'rgba(201,146,42,.08)', border: '1px solid rgba(201,146,42,.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#c9922a', marginTop: 12 }}>
                  ✏ Edit mode active — click on any section in the preview to edit its text. All changes are preserved when you download.
                </div>
              )}
            </div>

            {/* Report iframe */}
            <div style={{ border: '1px solid #252d40', borderRadius: 10, overflow: 'hidden' }}>
              <iframe
                ref={iframeRef}
                style={{ width: '100%', height: 860, border: 'none', display: 'block', background: '#fff' }}
                title="AQ Intelligence Report"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}
