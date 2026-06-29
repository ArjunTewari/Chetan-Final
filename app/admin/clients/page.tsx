'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Client = { id: string; email: string; role: string; created_at: string; last_run: string | null };

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' }) : '—';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg]           = useState('');
  const [msgType, setMsgType]   = useState<'ok'|'error'>('ok');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/clients')
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createClient = async () => {
    if (!email || !password) { setMsg('Email and password are required'); setMsgType('error'); return; }
    setCreating(true); setMsg('');
    const res = await fetch('/api/admin/clients', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const d = await res.json();
    if (d.error) { setMsg(d.error); setMsgType('error'); }
    else { setMsg('Client created successfully'); setMsgType('ok'); setEmail(''); setPassword(''); load(); }
    setCreating(false);
  };

  const deleteClient = async (userId: string, userEmail: string) => {
    if (!confirm(`Delete client ${userEmail}? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/clients', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId }) });
    const d = await res.json();
    if (d.error) { setMsg(d.error); setMsgType('error'); }
    else { setMsg('Client deleted'); setMsgType('ok'); load(); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#0a0e17', color:'#d8e4f0', fontFamily:'Inter,sans-serif', padding:'0 0 80px' }}>

      {/* Topbar */}
      <div style={{ background:'#111520', borderBottom:'1px solid #252d40', padding:'14px 32px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'#c9922a' }}>Emerald AI · Admin</div>
          <div style={{ fontSize:12, color:'#5e7494' }}>Client Management</div>
        </div>
        <Link href="/admin" style={{ background:'#1e2638', border:'1px solid #252d40', color:'#8fa3b8', borderRadius:5, padding:'6px 14px', fontSize:12, textDecoration:'none' }}>← Dashboard</Link>
      </div>

      <div style={{ maxWidth:800, margin:'0 auto', padding:'40px 24px 0' }}>

        {/* Create client */}
        <div style={{ background:'#111520', border:'1px solid #252d40', borderRadius:10, padding:'20px 22px', marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#c9922a', marginBottom:16 }}>Invite New Client</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <label style={{ fontSize:11, color:'#5e7494', display:'block', marginBottom:4 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com"
                style={{ background:'#1e2638', border:'1px solid #252d40', borderRadius:5, color:'#d8e4f0', padding:'9px 13px', fontSize:13, width:220 }}/>
            </div>
            <div>
              <label style={{ fontSize:11, color:'#5e7494', display:'block', marginBottom:4 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Temporary password"
                style={{ background:'#1e2638', border:'1px solid #252d40', borderRadius:5, color:'#d8e4f0', padding:'9px 13px', fontSize:13, width:200 }}/>
            </div>
            <button onClick={createClient} disabled={creating}
              style={{ background:'#c9922a', border:'none', color:'#0a0e17', borderRadius:5, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {creating ? 'Creating…' : 'Create Client'}
            </button>
          </div>
          {msg && (
            <div style={{ marginTop:10, fontSize:12, color: msgType === 'ok' ? '#4caf74' : '#e05c5c' }}>{msg}</div>
          )}
        </div>

        {/* Client list */}
        <div style={{ background:'#111520', border:'1px solid #252d40', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'16px 22px', borderBottom:'1px solid #252d40', display:'flex', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#d8e4f0' }}>All Accounts</div>
            <div style={{ fontSize:11, color:'#5e7494' }}>{clients.length} accounts</div>
          </div>
          {loading ? (
            <div style={{ padding:'32px', color:'#5e7494', fontSize:13 }}>Loading…</div>
          ) : clients.length === 0 ? (
            <div style={{ padding:'32px', color:'#5e7494', fontSize:13, textAlign:'center' }}>No accounts yet.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#181e2e' }}>
                  {['Email','Role','Created','Last Run','Actions'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#5e7494' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} style={{ borderTop:'1px solid #252d40' }}>
                    <td style={{ padding:'11px 14px', color:'#d8e4f0', fontWeight:500 }}>{c.email}</td>
                    <td style={{ padding:'11px 14px' }}>
                      <span style={{
                        display:'inline-block', padding:'2px 8px', borderRadius:3, fontSize:10, fontWeight:700, fontFamily:'monospace',
                        background: c.role === 'admin' ? 'rgba(201,146,42,.15)' : 'rgba(76,175,116,.12)',
                        color: c.role === 'admin' ? '#c9922a' : '#4caf74',
                        border: `1px solid ${c.role === 'admin' ? 'rgba(201,146,42,.3)' : 'rgba(76,175,116,.3)'}`,
                      }}>{c.role}</span>
                    </td>
                    <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:11, color:'#5e7494' }}>{fmtDate(c.created_at)}</td>
                    <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:11, color:'#5e7494' }}>{fmtDate(c.last_run)}</td>
                    <td style={{ padding:'11px 14px' }}>
                      {c.role !== 'admin' && (
                        <button onClick={() => deleteClient(c.id, c.email)}
                          style={{ background:'rgba(224,92,92,.1)', border:'1px solid rgba(224,92,92,.3)', color:'#e05c5c', borderRadius:4, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}
