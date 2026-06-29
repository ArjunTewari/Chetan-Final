'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

type Run = {
  id: string;
  user_email: string;
  organizations: string[];
  article_count: number;
  duration_s: number;
  cost_claude: number;
  cost_openai: number;
  cost_perplexity: number;
  cost_gemini: number;
  cost_youtube: number;
  cost_apidirect: number;
  cost_total: number;
  models_used: Record<string, number> | null;
  created_at: string;
};

type MonthCost = { claude: number; openai: number; perplexity: number; gemini: number; youtube: number; apidirect: number; total: number };

const fmt2 = (n: number) => `$${n.toFixed(4)}`;
const fmtDate = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' });

export default function AdminPage() {
  const [totalRuns, setTotalRuns]   = useState(0);
  const [totalCost, setTotalCost]   = useState(0);
  const [monthCost, setMonthCost]   = useState<MonthCost | null>(null);
  const [runs, setRuns]             = useState<Run[]>([]);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(d => {
        setTotalRuns(d.totalRuns || 0);
        setTotalCost(d.totalCost || 0);
        setMonthCost(d.monthCost || null);
        setRuns(d.runs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const signOut = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = '/login';
  };

  const barPct = (v: number, total: number) => total > 0 ? Math.round((v / total) * 100) : 0;
  const mc = monthCost;

  const costBars = mc ? [
    { label:'Claude',     val: mc.claude,     col:'#c9922a' },
    { label:'OpenAI',     val: mc.openai,     col:'#10b981' },
    { label:'Perplexity', val: mc.perplexity, col:'#3b82f6' },
    { label:'Gemini',     val: mc.gemini,     col:'#a855f7' },
    { label:'YouTube',    val: mc.youtube,    col:'#ef4444' },
    { label:'API',        val: mc.apidirect,  col:'#f97316' },
  ] : [];

  return (
    <div style={{ minHeight:'100vh', background:'#0a0e17', color:'#d8e4f0', fontFamily:'Inter,sans-serif', padding:'0 0 80px' }}>

      {/* Topbar */}
      <div style={{ background:'#111520', borderBottom:'1px solid #252d40', padding:'14px 32px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'#c9922a' }}>Emerald AI · Admin</div>
          <div style={{ fontSize:12, color:'#5e7494' }}>AQ Intelligence Platform — Administrator Console</div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <Link href="/admin/clients" style={{ background:'#1e2638', border:'1px solid #252d40', color:'#8fa3b8', borderRadius:5, padding:'6px 14px', fontSize:12, textDecoration:'none' }}>Manage Clients</Link>
          <button onClick={signOut} style={{ background:'transparent', border:'1px solid #252d40', color:'#5e7494', borderRadius:5, padding:'6px 14px', fontSize:12, cursor:'pointer' }}>Sign out</button>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'40px 24px 0' }}>

        {loading ? (
          <div style={{ color:'#5e7494', fontFamily:'monospace', fontSize:13, padding:'60px 0' }}>Loading dashboard…</div>
        ) : (
          <>
            {/* Overview cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:32 }}>
              {[
                { label:'Total Reports', value: totalRuns.toString(), sub:'all time' },
                { label:'Total API Cost', value: fmt2(totalCost), sub:'all time' },
                { label:'This Month', value: mc ? fmt2(mc.total) : '$0.0000', sub:'current month' },
              ].map(c => (
                <div key={c.label} style={{ background:'#111520', border:'1px solid #252d40', borderRadius:10, padding:'20px 22px' }}>
                  <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:'#5e7494', marginBottom:8 }}>{c.label}</div>
                  <div style={{ fontFamily:'monospace', fontSize:28, fontWeight:700, color:'#c9922a', lineHeight:1 }}>{c.value}</div>
                  <div style={{ fontSize:11, color:'#3a4a5e', marginTop:4 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* This month cost breakdown */}
            {mc && mc.total > 0 && (
              <div style={{ background:'#111520', border:'1px solid #252d40', borderRadius:10, padding:'20px 22px', marginBottom:24 }}>
                <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:'#5e7494', marginBottom:14 }}>This Month — Cost Breakdown</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {costBars.filter(b => b.val > 0).map(b => (
                    <div key={b.label} style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ fontSize:11, color:'#8fa3b8', width:80, flexShrink:0 }}>{b.label}</div>
                      <div style={{ flex:1, height:8, background:'#1e2638', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${barPct(b.val, mc.total)}%`, background:b.col, borderRadius:4 }}/>
                      </div>
                      <div style={{ fontFamily:'monospace', fontSize:11, color:b.col, width:80, textAlign:'right' }}>{fmt2(b.val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Run history */}
            <div style={{ background:'#111520', border:'1px solid #252d40', borderRadius:10, overflow:'hidden', marginBottom:24 }}>
              <div style={{ padding:'16px 22px', borderBottom:'1px solid #252d40', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#d8e4f0' }}>Report Run History</div>
                <div style={{ fontSize:11, color:'#5e7494' }}>{runs.length} runs</div>
              </div>
              {runs.length === 0 ? (
                <div style={{ padding:'32px 22px', color:'#5e7494', fontSize:13, textAlign:'center' }}>No reports have been run yet.</div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#181e2e' }}>
                        {['Date','Client','Orgs','Articles','Duration','Claude','OpenAI','Perplexity','YT','Total','Detail'].map(h => (
                          <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#5e7494', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map(r => (
                        <>
                          <tr key={r.id} style={{ borderTop:'1px solid #252d40' }}>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#8fa3b8', whiteSpace:'nowrap' }}>{fmtDate(r.created_at)}</td>
                            <td style={{ padding:'10px 12px', fontSize:12, color:'#d8e4f0', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.user_email}</td>
                            <td style={{ padding:'10px 12px', fontSize:11, color:'#8fa3b8' }}>{r.organizations?.length || 0}</td>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11 }}>{r.article_count || 0}</td>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#5e7494' }}>{r.duration_s}s</td>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#c9922a' }}>{fmt2(r.cost_claude || 0)}</td>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#10b981' }}>{fmt2(r.cost_openai || 0)}</td>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#3b82f6' }}>{fmt2(r.cost_perplexity || 0)}</td>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#ef4444' }}>{fmt2(r.cost_youtube || 0)}</td>
                            <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#d8e4f0' }}>{fmt2(r.cost_total || 0)}</td>
                            <td style={{ padding:'10px 12px' }}>
                              <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                                style={{ background:'#1e2638', border:'1px solid #252d40', color:'#8fa3b8', borderRadius:4, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>
                                {expanded === r.id ? '▲ Hide' : '▼ Show'}
                              </button>
                            </td>
                          </tr>
                          {expanded === r.id && r.models_used && (
                            <tr key={r.id + '_detail'} style={{ background:'#0d1220' }}>
                              <td colSpan={11} style={{ padding:'12px 22px' }}>
                                <div style={{ display:'flex', gap:24, flexWrap:'wrap', fontFamily:'monospace', fontSize:11 }}>
                                  {[
                                    { k:'Haiku calls', v: r.models_used.haiku_calls },
                                    { k:'Haiku tokens in', v: r.models_used.haiku_input_tokens },
                                    { k:'Haiku tokens out', v: r.models_used.haiku_output_tokens },
                                    { k:'Sonnet calls', v: r.models_used.sonnet_calls },
                                    { k:'Sonnet tokens in', v: r.models_used.sonnet_input_tokens },
                                    { k:'Sonnet tokens out', v: r.models_used.sonnet_output_tokens },
                                    { k:'GPT-4o mini', v: `${r.models_used.openai_calls || 0} calls` },
                                    { k:'Perplexity', v: `${r.models_used.perplexity_calls || 0} calls` },
                                    { k:'Gemini Flash', v: `${r.models_used.gemini_calls || 0} calls` },
                                    { k:'YouTube API', v: `${r.models_used.youtube_calls || 0} calls` },
                                  ].map(m => m.v != null && m.v !== 0 ? (
                                    <div key={m.k}>
                                      <span style={{ color:'#5e7494' }}>{m.k}: </span>
                                      <span style={{ color:'#c9922a', fontWeight:600 }}>{typeof m.v === 'number' ? m.v.toLocaleString() : m.v}</span>
                                    </div>
                                  ) : null)}
                                </div>
                                <div style={{ marginTop:8, fontSize:11, color:'#5e7494' }}>
                                  Orgs: {r.organizations?.join(', ')}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @media (max-width: 700px) {
          div[style*="grid-template-columns:repeat(3,1fr)"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
