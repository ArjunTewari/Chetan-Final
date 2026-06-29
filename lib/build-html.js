'use strict';
/**
 * build-html.js — Generates the full AQ Intelligence HTML report.
 * Ported from emerald-ai/pipeline.js buildHTML + social-er.js buildSocialERHtml.
 * Data sources labelled as "Serper" / "Official API" (no vendor names shown).
 */

const OUTLETS = ['Times of India','Hindustan Times','The Hindu','India Today','News18','NDTV','Aaj Tak','India TV','ABP News'];
const PRINT_OUTLETS = ['Times of India','Hindustan Times','The Hindu'];
const TV_CHANNELS_ENGLISH = ['NDTV','News18','India Today'];
const TV_CHANNELS_HINDI = ['Aaj Tak','India TV','ABP News'];
const TOPICS = ['NCAP','Policy','PM2.5 Exposure','Stubble Burning','Clean Air Finance','Vehicular Pollution','Health Impact','Industrial Pollution','Heat-AQI','Brick Kilns','Petrol Emissions','Diesel Emissions','Super Emitters','Thermal Power Plants','Household Pollution','Indoor Pollution','Biomass Air Pollution','Rice Residue Burning','Wheat Residue Burning','Road Dust'];
const AEO_QUESTIONS = [
  'Which organisations are the most authoritative sources on air quality data and policy in India?',
  'Which organisations publish the most reliable AQI and PM2.5 data for India?',
  'Which think tanks are leading clean air policy research in India?',
  'Which organisations should journalists cite for NCAP implementation assessments?',
  'Which NGOs are most influential in advocating air pollution solutions in India?',
  'Which organisations produce the most credible research on vehicular pollution?',
  'Who publishes peer-reviewed indoor air quality studies in South Asia?',
  'Which Indian organisations are most cited in international climate and air quality policy?',
  'What are the best sources for latest data on air quality improvements in India?',
  'Which bodies provide the most reliable assessments of NCAP targets?',
  'Which organisations are leading clean air finance research in India?',
  'Who provides the most credible data on PM2.5 health impact in India?',
  'Which organisations are key voices on stubble burning policy solutions?',
  'Who tracks the health burden of air pollution most rigorously in India?',
  'Which organisations are most cited in government air quality policy consultations?',
];

const ORG_COLORS_HEX = ['ef4444','f97316','eab308','84cc16','22c55e','10b981','14b8a6','06b6d4','3b82f6','6366f1','a855f7','ec4899','f43f5e'];
const orgHex = i => '#' + ORG_COLORS_HEX[i % ORG_COLORS_HEX.length];

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function canonOutlet(src) {
  if (!src) return null;
  const s = src.toLowerCase();
  if (s.includes('times of india') || s.includes('timesofindia') || s.includes('indiatimes')) return 'Times of India';
  if (s.includes('hindustan times') || s.includes('hindustantimes')) return 'Hindustan Times';
  if (s.includes('the hindu') || s.includes('thehindu')) return 'The Hindu';
  if (s.includes('india today') || s.includes('indiatoday')) return 'India Today';
  if (s.includes('ndtv')) return 'NDTV';
  if (s.includes('news18')) return 'News18';
  if (s.includes('aaj tak') || s.includes('aajtak')) return 'Aaj Tak';
  if (s.includes('india tv') || s.includes('indiatv')) return 'India TV';
  if (s.includes('abp news') || s.includes('abplive')) return 'ABP News';
  return null;
}

function parseDateStr(s) {
  if (!s) return null;
  const now = new Date();
  const ago = s.match(/(\d+)\s*(day|week|month|year)/i);
  if (ago) {
    const n = parseInt(ago[1]), u = ago[2][0].toLowerCase(), d = new Date(now);
    if (u === 'd') d.setDate(d.getDate() - n);
    else if (u === 'w') d.setDate(d.getDate() - n * 7);
    else if (u === 'm') d.setMonth(d.getMonth() - n);
    else d.setFullYear(d.getFullYear() - n);
    return d;
  }
  try { const d = new Date(s); if (!isNaN(d.getTime())) return d; } catch {}
  return null;
}

function momentumSection(arts, ORGS, DATE_FROM, DATE_TO, spikeAnnotations = []) {
  const start = new Date(DATE_FROM);
  const end   = new Date(DATE_TO);
  const weeks = [];
  const cur = new Date(start);
  cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
  if (cur > start) cur.setDate(cur.getDate() - 7);
  while (cur <= end) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7); }

  const buckets = weeks.map(() => ORGS.map(() => 0));
  ORGS.forEach((org, oi) => {
    (arts[org] || []).forEach(art => {
      const d = parseDateStr(art.date || '');
      if (!d) return;
      for (let wi = 0; wi < weeks.length; wi++) {
        const wEnd = new Date(weeks[wi]); wEnd.setDate(wEnd.getDate() + 7);
        if (d >= weeks[wi] && d < wEnd) { buckets[wi][oi]++; break; }
      }
    });
  });

  const maxCount = Math.max(...buckets.flat(), 1);
  const orgColors = ORGS.map((_, i) => ORG_COLORS_HEX[i % ORG_COLORS_HEX.length]);
  const totalPerOrg = ORGS.map(o => (arts[o] || []).length);

  const legend = ORGS.map((o, i) =>
    `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted2)"><div style="width:10px;height:10px;border-radius:2px;flex-shrink:0;background:#${orgColors[i]}"></div>${esc(o)}: <strong style="color:var(--text);font-weight:600">${totalPerOrg[i]}</strong></div>`
  ).join('');

  const weekBars = weeks.map((w, wi) => {
    const label = `${String(w.getMonth()+1).padStart(2,'0')}-${String(w.getDate()).padStart(2,'0')}`;
    const bars = ORGS.map((org, oi) => {
      const count = buckets[wi][oi];
      const h = count > 0 ? Math.max(2, Math.round((count / maxCount) * 76)) : 2;
      return `<div style="flex:1;border-radius:2px 2px 0 0;min-height:2px;background:#${orgColors[oi]};height:${h}px" title="${esc(org)}: ${count}"></div>`;
    }).join('');
    const isLast = wi === weeks.length - 1;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px${isLast ? '' : ';border-right:1px solid rgba(94,116,148,0.18);padding-right:3px;margin-right:1px'}"><div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:76px">${bars}</div><div style="font-family:monospace;font-size:9px;color:#5e7494;text-align:center">${label}</div></div>`;
  }).join('');

  const spikeCards = spikeAnnotations.length ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:20px">
${spikeAnnotations.sort((a,b) => b.count - a.count).map(s => {
  const orgIdx = ORGS.indexOf(s.org);
  const col = ORG_COLORS_HEX[orgIdx % ORG_COLORS_HEX.length] || '3d8ef0';
  const outlets = [...new Set(s.articles.map(a => a.source || '').filter(Boolean))].slice(0,4).join(', ');
  return `<div style="display:flex;gap:14px;align-items:flex-start;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-left:3px solid #${col};border-radius:6px">
  <div style="flex-shrink:0;font-family:monospace;font-size:10px;color:var(--muted);width:80px;padding-top:1px">${esc(s.wLabel)}</div>
  <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#${col};margin-bottom:3px">${esc(s.org)} spike: ${s.count} articles</div>
  ${s.annotation ? `<div style="font-size:12px;color:var(--text);line-height:1.55">${esc(s.annotation)}</div>` : ''}
  ${outlets ? `<div style="margin-top:4px;font-size:11px;color:var(--muted2)">${esc(outlets)}</div>` : ''}
  </div></div>`;
}).join('')}</div>` : '';

  return `<section class="sec" id="momentum"><div class="sh"><div class="se">Section 03c</div><h2 class="st">Coverage Momentum</h2>
<div class="sd">Weekly AQ article volume per organisation over the report period. Spikes traced to triggering events.</div><div class="sdiv"></div></div>
<div class="mch"><div style="margin-bottom:12px"><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">Weekly article volume — AQ-scoped</div><div style="font-size:11px;color:var(--muted);margin-bottom:10px">${esc(DATE_FROM)} to ${esc(DATE_TO)}</div><div style="display:flex;gap:12px;flex-wrap:wrap">${legend}</div></div>
<div class="wbars">${weekBars}</div>
<div style="font-size:10px;color:var(--muted);margin-top:6px">Bar height = article count that week.</div>
</div>${spikeCards}</section>`;
}

function buildSocialSection(socialResults, ORGS) {
  const fmtK = n => n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n||0);
  const erPct = (eng, posts, fol) => (posts > 0 && fol > 0) ? ((eng/posts/fol)*100).toFixed(2)+'%' : null;

  const rows = ORGS.map((org, i) => {
    const s = socialResults[org] || {};
    const xr = s.x || {};
    const ig = s.ig || {};
    const li = s.li || {};
    const yt = s.yt || {};
    const xPosts = xr.aqPosts || 0;
    const igPosts = ig.aqPosts || 0;
    const liPosts = li.totalPosts || 0;
    const ytPosts = yt.videoCount || 0;
    const total = xPosts + igPosts + liPosts + ytPosts;
    const xER  = erPct((xr.totalLikes||0)+(xr.totalReplies||0), xPosts, xr.followers||0);
    const igER = erPct((ig.totalLikes||0)+(ig.totalComments||0), igPosts, ig.followers||0);
    const ytER = (yt.avgER||yt.avgViewER) > 0 ? (yt.avgER||yt.avgViewER).toFixed(2)+'%' : null;
    const col = orgHex(i);
    const sub = (val, c2) => val ? `<div style="font-size:9px;font-family:monospace;color:${c2};margin-top:2px">${val}</div>` : '';
    return `<tr style="border-top:1px solid #252d40">
      <td style="padding:8px 12px"><span style="font-family:monospace;font-size:11px;font-weight:700;color:${col}">${esc(org)}</span></td>
      <td style="padding:8px 12px;text-align:center">
        <div style="font-family:monospace;font-size:13px;font-weight:700;color:#4a7fd4">${liPosts}</div>
      </td>
      <td style="padding:8px 12px;text-align:center">
        <div style="font-family:monospace;font-size:13px;font-weight:700;color:#4a9fd4">${xPosts}</div>
        ${sub(xr.followers ? fmtK(xr.followers)+' followers' : null, '#3a4a5e')}
        ${sub(xER ? 'ER '+xER : null, '#4a9fd4')}
      </td>
      <td style="padding:8px 12px;text-align:center">
        <div style="font-family:monospace;font-size:13px;font-weight:700;color:#e05c9c">${igPosts}</div>
        ${sub(ig.followers ? fmtK(ig.followers)+' followers' : null, '#3a4a5e')}
        ${sub(igER ? 'ER '+igER : null, '#e05c9c')}
      </td>
      <td style="padding:8px 12px;text-align:center">
        <div style="font-family:monospace;font-size:13px;font-weight:700;color:#e53935">${ytPosts}</div>
        ${sub(yt.subscribers ? fmtK(yt.subscribers)+' subs' : null, '#3a4a5e')}
        ${sub(ytER ? 'ER '+ytER : null, '#e53935')}
      </td>
      <td style="padding:8px 12px;text-align:center;font-family:monospace;font-size:15px;font-weight:700;color:${col}">${total}</td>
    </tr>`;
  }).join('');

  return `<section class="sec" id="social"><div class="sh"><div class="se">Section 08</div><h2 class="st">Social &amp; YouTube</h2>
<div class="sd">AQ-relevant posts across LinkedIn, X/Twitter, Instagram, and YouTube. Data sourced via official platform APIs. X: keyword-filtered. Instagram: AI-classified by Claude Haiku. LinkedIn: all posts in period.</div><div class="sdiv"></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
  <span style="font-family:monospace;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#5e7494">Data sources:</span>
  <span style="font-family:monospace;font-size:10px;background:rgba(74,127,212,.12);border:1px solid rgba(74,127,212,.3);color:#4a7fd4;border-radius:4px;padding:2px 8px">LinkedIn · Official API</span>
  <span style="font-family:monospace;font-size:10px;background:rgba(74,159,212,.12);border:1px solid rgba(74,159,212,.3);color:#4a9fd4;border-radius:4px;padding:2px 8px">X/Twitter · Official API</span>
  <span style="font-family:monospace;font-size:10px;background:rgba(224,92,156,.12);border:1px solid rgba(224,92,156,.3);color:#e05c9c;border-radius:4px;padding:2px 8px">Instagram · Official API</span>
  <span style="font-family:monospace;font-size:10px;background:rgba(229,57,53,.12);border:1px solid rgba(229,57,53,.3);color:#e53935;border-radius:4px;padding:2px 8px">YouTube · Data API v3</span>
</div>
<div style="overflow-x:auto;border:1px solid #252d40;border-radius:8px;margin-bottom:16px;overflow:hidden">
<table style="width:100%;border-collapse:collapse;font-size:12px">
<thead><tr style="background:#181e2e">
  <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5e7494">Org</th>
  <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4a7fd4">LinkedIn</th>
  <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4a9fd4">X/Twitter</th>
  <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e05c9c">Instagram</th>
  <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e53935">YouTube</th>
  <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c9922a">Total</th>
</tr></thead><tbody>${rows}</tbody>
</table></div>
<div style="font-family:monospace;font-size:9px;color:#3a4a5e;margin-bottom:16px">X: client-side AQ keyword filter. IG: Claude Haiku AQ classification. LI: all posts in period. YT: AQ-keyword-matched official channel videos. ER = (likes+replies or comments) ÷ AQ posts ÷ followers × 100.</div>
</section>`;
}

/**
 * Main HTML builder
 * @param {Object} p - all pipeline outputs
 */
function buildHTML(p) {
  const { ORGS, DATE_FROM, DATE_TO, CLIENT_NAME, data, arts, aeoResults, socialResults, emerging, execFindings, actions, spikeAnnotations, modelsUsed } = p;
  const now = new Date().toUTCString();
  const tot = ORGS.reduce((s, o) => s + (data[o]?.total || 0), 0);

  const orgChips = ORGS.map((o, i) =>
    `<span class="chip" style="background:${orgHex(i)}1a;color:${orgHex(i)};border:1px solid ${orgHex(i)}4d"><span style="width:7px;height:7px;border-radius:50%;display:inline-block;background:${orgHex(i)}"></span>${esc(o)}</span>`
  ).join('');

  const navOrgs = ORGS.map(o =>
    `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted2);padding:3px 20px"><div style="width:8px;height:8px;border-radius:2px;background:${orgHex(ORGS.indexOf(o))}"></div>${esc(o)}: ${data[o]?.total||0} arts</div>`
  ).join('');

  function sovBar() {
    const bars = ORGS.map((org, i) => {
      const pct = tot > 0 ? Math.round(((data[org]?.total || 0) / tot) * 100) : 0;
      return `<div style="background:${orgHex(i)};width:${pct}%;display:flex;align-items:center;padding-left:9px;font-family:monospace;font-size:11px;font-weight:500;color:#fff;min-width:0;overflow:hidden">${data[org]?.total||0}</div>`;
    }).join('');
    return `<div style="height:28px;background:#1e2638;border-radius:4px;overflow:hidden;display:flex;margin-bottom:12px">${bars}</div>`;
  }

  function sovByOrgTable() {
    const activeOutlets = PRINT_OUTLETS.filter(outlet => ORGS.some(o => (data[o]?.outletCounts?.[outlet] || 0) > 0));
    if (!activeOutlets.length) return `<p style="color:var(--muted);font-size:12px">No newspaper site coverage indexed in this period.</p>`;
    return `<table class="nt"><thead><tr><th>Org</th>${activeOutlets.map(o => `<th>${esc(o)}</th>`).join('')}</tr></thead><tbody>
${ORGS.map((org, i) => `<tr><td><span style="font-family:monospace;font-size:11px;font-weight:700;color:${orgHex(i)}">${esc(org)}</span></td>${activeOutlets.map(outlet => {
  const evArts = (arts[org]||[]).filter(a => canonOutlet(a.source||'') === outlet);
  const n = evArts.length;
  if (!n) return `<td style="font-family:monospace;color:var(--muted)">0</td>`;
  const uid = `sov_${org}_${outlet}`.replace(/\W/g,'_');
  const links = evArts.slice(0,5).map(a => `<a href="${esc(a.url||'#')}" target="_blank" style="display:block;font-size:10px;color:var(--amber);text-decoration:none;margin-top:3px;line-height:1.4;white-space:normal;max-width:220px" title="${esc(a.title||'')}">${esc((a.title||'').length>70?(a.title||'').slice(0,70)+'…':(a.title||''))}</a>`).join('');
  return `<td style="font-family:monospace"><strong>${n}</strong><br><span onclick="td('${uid}')" style="font-size:10px;color:var(--muted2);cursor:pointer;user-select:none">↗ sources</span><div id="${uid}" style="display:none">${links}</div></td>`;
}).join('')}</tr>`).join('\n')}
</tbody></table>`;
  }

  function tvTable(channels) {
    return `<table class="nt"><thead><tr><th>Org</th>${channels.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
${ORGS.map((org, i) => `<tr><td><span style="font-family:monospace;font-size:11px;font-weight:700;color:${orgHex(i)}">${esc(org)}</span></td>${channels.map(ch => {
  const evArts = (arts[org]||[]).filter(a => canonOutlet(a.source||'') === ch);
  const n = evArts.length;
  if (!n) return `<td style="font-family:monospace;color:var(--muted)">0</td>`;
  const uid = `tv_${org}_${ch}`.replace(/\W/g,'_');
  const links = evArts.slice(0,5).map(a => `<a href="${esc(a.url||'#')}" target="_blank" style="display:block;font-size:10px;color:var(--amber);text-decoration:none;margin-top:3px;line-height:1.4;white-space:normal;max-width:220px" title="${esc(a.title||'')}">${esc((a.title||'').length>70?(a.title||'').slice(0,70)+'…':(a.title||''))}</a>`).join('');
  return `<td style="font-family:monospace"><strong>${n}</strong><br><span onclick="td('${uid}')" style="font-size:10px;color:var(--muted2);cursor:pointer;user-select:none">↗ sources</span><div id="${uid}" style="display:none">${links}</div></td>`;
}).join('')}</tr>`).join('\n')}
</tbody></table>`;
  }

  function topicCards() {
    const topicArts = {};
    TOPICS.forEach(tp => { topicArts[tp] = {}; ORGS.forEach(org => { topicArts[tp][org] = []; }); });
    ORGS.forEach(org => {
      (data[org]?.classifications || []).forEach((c, ci) => {
        const t = (c.aq_subtopic || '').trim();
        const match = TOPICS.find(tp => tp.toLowerCase() === t.toLowerCase() || t.toLowerCase().includes(tp.toLowerCase().split(' ')[0].toLowerCase()));
        if (match) {
          const art = arts[org]?.[ci] || {};
          topicArts[match][org].push({ ...c, title: art.title || '', url: art.url || '' });
        }
      });
    });

    const theadTopics = TOPICS.map(tk => `<th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);min-width:120px;vertical-align:bottom;border-left:1px solid var(--border)">${esc(tk)}</th>`).join('');
    const tbodyRows = ORGS.map((org, i) => {
      const orgCells = TOPICS.map(tk => {
        const artList = topicArts[tk][org] || [];
        const cv = artList.length;
        if (cv <= 1) return `<td style="padding:10px 12px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);vertical-align:top"><span style="font-family:monospace;font-size:10px;color:var(--muted)">—</span></td>`;
        const label = cv >= 5 ? 'Leader' : 'Active';
        const [bgCol, borderCol, textCol] = cv >= 5 ? ['rgba(74,222,128,.10)','rgba(74,222,128,.30)','#4ade80'] : ['rgba(251,191,36,.10)','rgba(251,191,36,.30)','#fbbf24'];
        const uid = `tm${org.replace(/\W/g,'')}${tk.replace(/\W/g,'')}`;
        const srcLinks = artList.map(a => a.url ? `<a href="${esc(a.url)}" target="_blank" style="display:block;font-size:10px;color:var(--amber);text-decoration:none;padding:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.title||a.url)}</a>` : `<div style="font-size:10px;color:var(--muted);padding:2px 0">${esc(a.title||'')}</div>`).join('');
        return `<td style="padding:10px 12px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);vertical-align:top">
          <div style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:3px;background:${bgCol};border:1px solid ${borderCol};margin-bottom:5px;white-space:nowrap">
            <span style="font-family:monospace;font-size:10px;font-weight:700;color:${textCol}">${label} · ${cv}</span>
          </div>
          <div><a class="ctag" onclick="td('${uid}')" style="cursor:pointer;font-size:10px;padding:2px 6px;background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.25);border-radius:3px;color:var(--amber);font-weight:700;text-decoration:none">↗ sources</a><div class="evd" id="${uid}" style="padding:4px 0;border:none;max-height:200px;overflow-y:auto">${srcLinks}</div></div>
        </td>`;
      }).join('');
      return `<tr><td style="padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap;position:sticky;left:0;background:var(--surface2);z-index:1"><span style="font-family:monospace;font-size:11px;font-weight:700;color:${orgHex(i)}">${esc(org)}</span></td>${orgCells}</tr>`;
    }).join('');

    return `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--surface2)">
      <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);position:sticky;left:0;background:var(--surface2);z-index:2;white-space:nowrap">Org</th>
      ${theadTopics}
    </tr></thead><tbody>${tbodyRows}</tbody></table></div></div>`;
  }

  function aeoSection() {
    const hasAEO = Object.values(aeoResults||{}).some(v => v.mentions > 0);
    const llmNames = [...new Set(Object.values(aeoResults||{}).flatMap(v => Object.keys(v.llmBreakdown||{})))];
    const aeoRanked = [...ORGS].map((o, i) => ({ o, i, m: (aeoResults?.[o]?.mentions) || 0 })).sort((a,b) => b.m - a.m);
    const maxMentions = Math.max(1, ...aeoRanked.map(x => x.m));
    const aeoRankBar = aeoRanked.map((x, ri) =>
      `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border)"><span style="font-family:monospace;font-size:10px;color:var(--muted);width:16px;flex-shrink:0">${ri+1}</span><span style="font-size:11px;font-weight:600;color:${orgHex(x.i)};width:90px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.o)}</span><div style="flex:1;height:7px;background:var(--surface3);border-radius:4px;overflow:hidden"><div style="height:100%;background:${orgHex(x.i)};width:${Math.round((x.m/maxMentions)*100)}%;border-radius:4px"></div></div><span style="font-family:monospace;font-size:11px;font-weight:700;width:60px;text-align:right;color:${orgHex(x.i)};flex-shrink:0">${x.m} <span style="font-weight:400;color:var(--muted)">mentions</span></span></div>`
    ).join('');
    const cards = ORGS.map((org, i) => {
      const a = aeoResults?.[org] || { mentions: 0, llmBreakdown: {}, topResponse: '' };
      const col = orgHex(i);
      const bk = Object.entries(a.llmBreakdown || {}).map(([llm, v]) =>
        `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted2)">${esc(llm)}</span><span style="font-family:monospace;font-weight:600;color:${col}">${v.mentions}/${v.total||'?'} mentions</span></div>`
      ).join('');
      return `<div class="cqp" style="border-top:2px solid ${col}">
        <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${col};margin-bottom:12px">${esc(org)}</div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div style="font-family:monospace;font-size:40px;font-weight:700;color:${col};line-height:1;flex-shrink:0">${a.mentions||0}</div>
          <div><div style="font-size:12px;color:var(--muted2);margin-bottom:2px">LLM Mentions</div><div style="font-size:11px;color:var(--muted)">${llmNames.length > 0 ? 'across '+llmNames.length+' model'+(llmNames.length!==1?'s':'') : 'no models run'}</div></div>
        </div>
        ${bk || '<div style="font-size:11px;color:var(--muted)">No LLM data collected</div>'}
        ${a.topResponse ? `<div class="cqe cqd" style="margin-top:10px"><div class="cqet">Example LLM response</div><div style="color:var(--text);font-family:monospace;font-size:11px;line-height:1.5">&ldquo;${esc(a.topResponse)}&rdquo;</div></div>` : ''}
      </div>`;
    }).join('');
    const grid = ORGS.length <= 2 ? `display:grid;grid-template-columns:repeat(${ORGS.length},1fr);gap:16px;margin-bottom:20px` : `display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:20px`;
    const aeoQs = AEO_QUESTIONS.map((q, i) => `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px"><div style="font-family:monospace;font-size:10px;color:var(--amber);flex-shrink:0;padding-top:2px">${i+1}</div><div style="color:var(--muted2)">${esc(q)}</div></div>`).join('');
    return `<section class="sec" id="aeo"><div class="sh"><div class="se">AEO — LLM Visibility</div><h2 class="st">AI Engine Optimisation</h2>
<div class="sd">How often is each organisation cited when AI models are asked about Indian air quality? ${hasAEO ? 'Probed with '+AEO_QUESTIONS.length+' standard questions per LLM.' : 'No LLM API keys configured — add OPENAI_KEY, PERPLEXITY_KEY or GEMINI_KEY to enable.'}</div><div class="sdiv"></div></div>
${!hasAEO ? `<div style="background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.3);border-radius:8px;padding:14px 16px;margin-bottom:18px;font-size:13px;color:var(--muted2)"><strong style="color:var(--warn)">⚠ AEO data not available</strong> — Configure LLM API keys in Vercel environment variables to populate this section.</div>` : ''}
${hasAEO ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px">LLM Mention Ranking</div>${aeoRankBar}</div>` : ''}
<div style="${grid}">${cards}</div>
<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
  <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px">Standard AEO questions (${AEO_QUESTIONS.length} per LLM)</div>${aeoQs}
</div></section>`;
  }

  // Scorecard
  const ordinal = n => { const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
  const rankCol = r => r===1?'var(--good)':r<=3?'var(--amber)':'var(--muted2)';
  const rankedOrgs = ORGS.map((org, i) => ({ org, i, score: data[org]?.score||0 })).sort((a,b) => b.score - a.score);
  let _lastScore = null, _lastRank = 0;
  rankedOrgs.forEach((o, idx) => { if (o.score===_lastScore) { o.rank=_lastRank; } else { o.rank=idx+1; _lastRank=idx+1; _lastScore=o.score; } });
  const maxSov = Math.max(...ORGS.map(o => data[o]?.sov||0), 1);
  const maxCit = Math.max(...ORGS.map(o => data[o]?.dataPct||0), 1);
  const maxAeo = Math.max(...ORGS.map(o => data[o]?.aeo||0), 1);
  const maxScr = Math.max(...ORGS.map(o => data[o]?.score||0), 1);
  const inlineBar = (val, max, col) => `<div style="display:flex;align-items:center;gap:6px"><div style="width:60px;height:5px;background:var(--surface3);border-radius:3px;flex-shrink:0;overflow:hidden"><div style="height:100%;width:${Math.round((val/max)*100)}%;background:${col};border-radius:3px"></div></div><span style="font-family:monospace;font-size:12px;font-weight:600;color:${col}">${val}</span></div>`;

  const scorecardRows = rankedOrgs.map(({ org, i, rank }) => {
    const d   = data[org] || {};
    const col = orgHex(i);
    const s   = socialResults?.[org] || {};
    const yt  = s.yt || {};
    const ytER = (yt.avgER||yt.avgViewER) > 0 ? (yt.avgER||yt.avgViewER).toFixed(2)+'%' : null;
    const socialScore = d.social || 0;
    return `<tr>
      <td style="text-align:center;font-family:monospace;font-size:13px;font-weight:700;color:${rankCol(rank)}">${ordinal(rank)}</td>
      <td><span style="font-size:12px;font-weight:700;color:${col};letter-spacing:.04em">${esc(org)}</span></td>
      <td>${inlineBar(d.sov||0, maxSov, col)}</td>
      <td>${inlineBar(d.dataPct||0, maxCit, col)}</td>
      <td>${(d.aeo||0) > 0 ? inlineBar(d.aeo, maxAeo, col) : `<span style="font-family:monospace;font-size:11px;color:var(--muted)">—</span>`}</td>
      <td style="text-align:center">${ytER ? `<span style="font-family:monospace;font-size:12px;color:var(--text)">${ytER}</span>` : `<span style="font-family:monospace;font-size:11px;color:var(--muted)">—</span>`}</td>
      <td style="text-align:center">${socialScore > 0 ? `<span style="font-family:monospace;font-size:13px;font-weight:600;color:${col}">${socialScore}<span style="font-size:10px;font-weight:400;color:var(--muted)">/10</span></span>` : `<span style="font-family:monospace;font-size:11px;color:var(--muted)">—</span>`}</td>
      <td>${inlineBar(d.score||0, maxScr, col)}</td>
    </tr>`;
  }).join('');

  // Appendix
  const appendixSections = ORGS.map((org, orgIdx) => {
    const d = data[org] || {};
    const cqColor = q => q==='Data Cited'?'var(--good)':q==='Named Mention'?'var(--muted2)':q==='Not in scraped text'?'#8b7cf8':'var(--muted)';
    const rows = (arts[org]||[]).map((a, i) => {
      const c = (d.classifications||[])[i] || {};
      return `<tr><td>${i+1}</td><td>${esc(a.source||'')}</td><td style="font-size:10px">${esc(a.date||'')}</td><td style="max-width:260px">${esc(a.title||'')}</td><td style="font-size:10px;font-family:monospace;color:${cqColor(c.citation_quality||'')}">${esc(c.citation_quality||'—')}</td><td>${a.url?`<a href="${esc(a.url)}" target="_blank">link</a>`:'—'}</td></tr>`;
    }).join('');
    return `<details ${orgIdx===0?'open':''} style="border:1px solid var(--border);border-radius:6px;margin-bottom:8px;overflow:hidden">
<summary style="padding:10px 16px;cursor:pointer;background:var(--surface2);display:flex;align-items:center;justify-content:space-between;list-style:none;user-select:none">
  <span style="font-size:13px;font-weight:600;color:var(--text)">${esc(org)} <span style="color:var(--muted);font-weight:400">— ${d.total||0} articles</span></span>
  <span style="font-family:monospace;font-size:10px;color:var(--muted)">▾</span>
</summary>
<div style="padding:0 0 4px">
<table class="apt"><thead><tr><th>#</th><th>Outlet</th><th>Date</th><th>Headline</th><th>Classification</th><th>URL</th></tr></thead><tbody>${rows}</tbody></table>
</div></details>`;
  }).join('');

  // Exec findings
  const execCards = (execFindings?.length > 0 ? execFindings : [{ headline: `${ORGS[0]||'Top org'} leads AQ coverage`, detail: ORGS.map(o => `${o}: ${data[o]?.total||0} articles`).join(', '), section_ref: '§03' }])
    .slice(0,3)
    .map((f, i) => `<div class="fc"><div class="fn">${i+1}</div><div class="fb"><div class="fh">${esc(f.headline)}</div><div class="fd">${esc(f.detail)}${f.section_ref?` <span style="font-family:monospace;font-size:10px;color:var(--muted)">→ ${esc(f.section_ref)}</span>`:''}</div></div></div>`)
    .join('');

  // Emerging gaps
  const emergingCards = !emerging?.length
    ? `<div class="em-card"><div class="em-topic">Insufficient data</div><div class="em-body">Not enough general AQ articles were fetched to identify white-space gaps. Check API keys or broaden the date range.</div></div>`
    : emerging.map(n => {
        const articleLinks = (n.supporting_articles||[]).map(a => a.url ? `<div class="em-src"><a href="${esc(a.url)}" target="_blank" style="color:var(--amber);text-decoration:none">${esc(a.title)}</a></div>` : `<div class="em-src">${esc(a.title||a)}</div>`).join('');
        const artCount = (n.supporting_articles||[]).length;
        return `<div class="em-card">
<div class="em-hdr"><div class="em-topic">${esc(n.topic)}</div></div>
<div class="em-body">${esc(n.description||'')}</div>
${articleLinks?`<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px"><div style="font-family:monospace;font-size:10px;color:var(--muted2);margin-bottom:7px;letter-spacing:.04em">${artCount} article${artCount!==1?'s':''} in this narrative</div>${articleLinks}</div>`:''}
</div>`;
      }).join('');

  // Action matrix
  const pmap = { 'Fix Now':'pri-fix', 'Leverage':'pri-lev', 'Optimise':'pri-opt', 'Invest':'pri-inv' };
  const actionRows = !actions?.length
    ? `<tr><td colspan="5" style="color:var(--muted)">Action matrix generation failed</td></tr>`
    : actions.map(a => {
        const oi = ORGS.indexOf(a.org);
        const oc = oi >= 0 ? orgHex(oi) : '#c9922a';
        return `<tr><td style="font-weight:600;color:${oc}">${esc(a.org)}</td><td><span class="${pmap[a.priority]||'pri-opt'}">${esc(a.priority)}</span></td><td style="font-family:monospace;font-size:11px;color:var(--muted2)">${esc(a.area)}</td><td>${esc(a.action)}</td><td class="rat">${esc(a.rationale)}</td></tr>`;
      }).join('');

  const clsNotice = ORGS.every(o => (data[o]?.classified||0) === 0)
    ? `<div style="background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.3);border-radius:8px;padding:14px 16px;margin-bottom:18px;font-size:13px;color:var(--muted2)"><strong style="color:var(--warn)">⚠ Classification unavailable</strong> — Claude API calls failed. Check CLAUDE_KEY and re-run.</div>`
    : '';

  const topicCols = `175px ${ORGS.map(() => '1fr').join(' ')}`;

  const CSS = `:root{--ink:#0a0e17;--surface:#111520;--surface2:#181e2e;--surface3:#1e2638;--border:#252d40;--border2:#2e3a52;--text:#d8e4f0;--muted:#5e7494;--muted2:#8fa3b8;--amber:#c9922a;--amber-dim:rgba(201,146,42,.12);--amber-glow:rgba(201,146,42,.06);--good:#4caf74;--warn:#d4a017;--bad:#e05c5c}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--ink);color:var(--text);line-height:1.65;font-size:14px}
.shell{display:flex;min-height:100vh}
.sidenav{width:220px;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--surface);border-right:1px solid var(--border);padding:28px 0;display:flex;flex-direction:column}
.sidenav-logo{padding:0 20px 24px;border-bottom:1px solid var(--border);margin-bottom:16px}
.sidenav-logo-name{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--amber)}
.sidenav-logo-sub{font-size:10px;color:var(--muted);margin-top:2px;font-family:monospace}
.nav-lbl{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);padding:12px 20px 6px}
.nav-a{display:block;padding:7px 20px;font-size:12px;color:var(--muted2);text-decoration:none;border-left:2px solid transparent}
.nav-a:hover{color:var(--text);background:var(--surface2)}.nav-a.active{color:var(--amber);border-left-color:var(--amber);background:var(--amber-glow)}
.sidenav-footer{margin-top:auto;padding:16px 20px 0;border-top:1px solid var(--border);font-family:monospace;font-size:10px;color:var(--muted);line-height:1.8}
.main{flex:1;min-width:0;padding:0 48px 80px}
.rh{padding:52px 0 44px;border-bottom:1px solid var(--border);margin-bottom:48px}
.ey{font-family:monospace;font-size:11px;color:var(--amber);letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px}
.rt{font-family:'DM Serif Display',serif;font-size:42px;line-height:1.15;margin-bottom:10px;font-weight:400}
.rti{color:var(--amber);font-style:italic}
.rm{font-size:13px;color:var(--muted2);margin-bottom:28px;font-family:monospace}
.chips{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.chip{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:4px;font-size:12px;font-weight:600}
.dn{background:var(--amber-glow);border:1px solid rgba(201,146,42,.2);border-radius:6px;padding:11px 16px;font-size:12px;color:var(--muted2);font-family:monospace}
.dn strong{color:var(--amber)}
.sec{margin-bottom:56px;scroll-margin-top:24px}
.sh{margin-bottom:24px}
.se{font-family:monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.st{font-family:'DM Serif Display',serif;font-size:28px;font-weight:400;color:var(--text);line-height:1.2}
.sd{margin-top:8px;font-size:13px;color:var(--muted2);max-width:680px}
.sdiv{width:40px;height:2px;background:var(--amber);margin:14px 0 0}
.mch{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}
.ch-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
.wbars{display:flex;gap:5px;align-items:flex-end;height:96px;margin-bottom:8px}
.nt,.at,.apt{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
.nt th,.at th,.apt th{background:var(--surface3);padding:10px 14px;text-align:left;font-family:monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)}
.nt td,.at td,.apt td{padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:top}
.nt tr:hover td{background:var(--surface2)}
.ctag{display:inline-flex;font-family:monospace;font-size:10px;color:var(--amber);background:var(--amber-dim);border:1px solid rgba(201,146,42,.25);border-radius:3px;padding:1px 6px;cursor:pointer;text-decoration:none;vertical-align:middle;margin-left:4px}
.evd{display:none;background:var(--ink);border:1px solid var(--border2);border-radius:5px;padding:12px 14px;margin-top:9px}
.evd.open{display:block}
.ei{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start}
.ei:last-child{border:none;padding-bottom:0}
.eq{font-family:monospace;font-size:11px;color:var(--text);line-height:1.6;background:var(--surface3);border-left:2px solid var(--amber);padding:5px 9px;border-radius:0 3px 3px 0;margin-bottom:4px}
.es{font-family:monospace;font-size:10px;color:var(--muted)}.es a{color:var(--amber);text-decoration:none}
.lc{font-family:monospace;font-size:10px;color:var(--warn);background:rgba(212,160,23,.1);border:1px solid rgba(212,160,23,.25);border-radius:3px;padding:2px 6px}
.cqp{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:18px}
.cqe{padding:8px 10px;border-radius:4px;margin-bottom:6px;font-size:11px;line-height:1.6}
.cqd{background:rgba(76,175,116,.07);border-left:2px solid var(--good)}
.cqv{background:var(--surface3);border-left:2px solid var(--muted)}
.cqet{font-family:monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px}
.cqd .cqet{color:var(--good)}.cqv .cqet{color:var(--muted)}
.em-card{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:12px}
.em-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:12px}
.em-topic{font-size:14px;font-weight:600;color:var(--text)}
.em-body{font-size:13px;color:var(--muted2);line-height:1.65;margin-bottom:10px}
.em-src{font-size:11px;color:var(--muted);padding:3px 0;font-family:monospace;display:flex;gap:8px}
.em-src::before{content:"→";color:var(--amber)}
.fc{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:20px 22px;display:flex;gap:18px;align-items:flex-start;margin-bottom:14px}
.fn{font-family:'DM Serif Display',serif;font-size:36px;color:var(--amber);line-height:1;flex-shrink:0;opacity:.45;margin-top:2px}
.fb{flex:1}.fh{font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px;line-height:1.4}
.fd{font-size:13px;color:var(--muted2);line-height:1.65}
.pri-fix{display:inline-block;background:rgba(212,160,23,.12);color:var(--warn);border:1px solid rgba(212,160,23,.3);border-radius:3px;padding:2px 8px;font-family:monospace;font-size:10px;font-weight:600;white-space:nowrap}
.pri-lev{display:inline-block;background:rgba(76,175,116,.12);color:var(--good);border:1px solid rgba(76,175,116,.3);border-radius:3px;padding:2px 8px;font-family:monospace;font-size:10px;font-weight:600;white-space:nowrap}
.pri-opt{display:inline-block;background:rgba(61,142,240,.1);color:#3d8ef0;border:1px solid rgba(61,142,240,.25);border-radius:3px;padding:2px 8px;font-family:monospace;font-size:10px;font-weight:600;white-space:nowrap}
.pri-inv{display:inline-block;background:rgba(224,92,92,.1);color:var(--bad);border:1px solid rgba(224,92,92,.25);border-radius:3px;padding:2px 7px;font-family:monospace;font-size:10px;font-weight:600;white-space:nowrap}
.rat{font-size:11px;color:var(--muted);font-family:monospace;line-height:1.55}
.apt td{font-family:monospace;color:var(--muted2);font-size:11px}.apt td a{color:var(--amber);text-decoration:none}
.rf{border-top:1px solid var(--border);padding:28px 0 0;font-family:monospace;font-size:10px;color:var(--muted);line-height:2}
#score table tbody tr{border-bottom:1px solid var(--border)}
#score table tbody tr:hover{background:var(--surface2)}
#score table td{padding:12px 12px}
#score table thead th{padding:10px 12px;background:var(--surface3)}
@media(max-width:900px){
  .sidenav{display:none}
  .main{padding:24px 20px 60px;max-width:100%}
  .rh{padding:32px 0 28px;margin-bottom:32px}
  .rt{font-size:28px}
  .st{font-size:22px}
  .wbars{height:64px}
  .fc{flex-direction:column;gap:10px}
  .fn{font-size:26px}
  .nt,.at,.apt{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
  #score table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
}
@media(max-width:480px){
  .main{padding:16px 14px 60px}
  .rt{font-size:20px}
  .st{font-size:18px}
}`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AQ Intelligence — ${esc(ORGS.join(' vs '))}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="shell">
<nav class="sidenav"><div class="sidenav-logo"><div class="sidenav-logo-name">Emerald AI</div><div class="sidenav-logo-sub">AQ Intelligence</div></div>
<div class="nav-lbl">Report</div><a href="#exec" class="nav-a active">Executive Summary</a>
<div class="nav-lbl">Media Analysis</div><a href="#sov" class="nav-a">AQ Press Analytics</a><a href="#tv" class="nav-a">TV Coverage</a><a href="#momentum" class="nav-a">Momentum</a><a href="#topics" class="nav-a">Topic Ownership</a><a href="#appendix" class="nav-a">Citations</a><a href="#em" class="nav-a">White-Space Gaps</a>
<div class="nav-lbl">Social &amp; Digital</div><a href="#social" class="nav-a">Social &amp; YouTube</a>
<div class="nav-lbl">Digital Presence</div><a href="#aeo" class="nav-a">AEO / LLM Visibility</a>
<div class="nav-lbl">Conclusions</div><a href="#score" class="nav-a">Scorecard</a><a href="#actions" class="nav-a">Action Matrix</a>
<div class="sidenav-footer">Generated: ${new Date().toISOString().slice(0,10)}<br>${navOrgs}CONFIDENTIAL</div></nav>
<main class="main">
<header class="rh" id="header"><div class="ey">Air Quality Media Intelligence · India</div>
<h1 class="rt">Air Quality<br><span class="rti">AQ Intelligence Report</span></h1>
<div class="rm">Period: ${esc(DATE_FROM)} → ${esc(DATE_TO)} · ${tot} AQ articles · ${now}</div>
<div class="chips">${orgChips}</div>
<div class="dn"><strong>Serper News Index + Official Social Platform APIs</strong> · All insights linked to verifiable evidence · ${now}</div>
</header>

<section class="sec" id="exec"><div class="sh"><div class="se">Section 01</div><h2 class="st">Executive Summary</h2><div class="sd">Headline comparative findings across ${ORGS.length} organisations — media, LLM visibility, and social.</div><div class="sdiv"></div></div>
<div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.2);border-radius:8px;overflow:hidden;margin-bottom:4px">
<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;cursor:pointer;user-select:none" onclick="toggleExecDraft()">
<span style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--amber)">Draft Executive Summary <span style="font-weight:400;color:var(--muted2)">(AI-generated — review before sharing)</span></span>
<span id="exec-draft-icon" style="font-family:monospace;font-size:12px;color:var(--amber)">▼ Show draft</span>
</div>
<div id="exec-draft" style="display:none;padding:0 18px 18px">${execCards}</div>
</div>
<div style="margin-top:20px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:var(--muted2);line-height:1.7">
  <strong style="font-weight:600;letter-spacing:.04em">METHODOLOGY</strong> —
  Serper News Index for media coverage · Claude Haiku 4.5 for article classification & topic tagging ·
  Claude Sonnet 4.6 for executive findings & action matrix · GPT-4o mini · Perplexity Sonar · Gemini 1.5 Flash for AEO visibility ·
  Official social platform APIs for social data · YouTube Data API v3 for video metrics.
</div>
</section>

<section class="sec" id="sov"><div class="sh"><div class="se">Section 03</div><h2 class="st">AQ Press Analytics</h2><div class="sd">AQ article counts per org, deduplicated, date-filtered. Source: Serper News Index.</div><div class="sdiv"></div></div>
<div class="mch"><div class="ch-hdr"><div style="font-size:13px;font-weight:600;color:var(--text)">All AQ coverage — ${tot} articles</div></div>
${sovBar()}
<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--muted2);margin-bottom:10px">${ORGS.map((o,i) => `<div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${orgHex(i)};margin-right:5px"></span>${esc(o)}: ${data[o]?.total||0}</div>`).join('')}</div>
</div>
<div style="font-size:12px;font-weight:600;color:var(--muted2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">Print / Digital</div>
${sovByOrgTable()}</section>

<section class="sec" id="tv"><div class="sh"><div class="se">Section 03b</div><h2 class="st">TV Channel Coverage</h2>
<div class="sd">AQ mentions in English TV (NDTV, News18, India Today) and Hindi TV (Aaj Tak, India TV, ABP News) channels.</div><div class="sdiv"></div></div>
<div style="margin-bottom:16px">
<div style="font-size:12px;font-weight:600;color:var(--muted2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">English TV</div>
${tvTable(TV_CHANNELS_ENGLISH)}</div>
<div>
<div style="font-size:12px;font-weight:600;color:var(--muted2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">Hindi TV</div>
${tvTable(TV_CHANNELS_HINDI)}</div></section>

${momentumSection(arts, ORGS, DATE_FROM, DATE_TO, spikeAnnotations)}

<section class="sec" id="topics"><div class="sh"><div class="se">Section 04</div><h2 class="st">Topic Ownership Map</h2>
<div class="sd">AQ sub-topics from article headlines and snippets classified by Claude Haiku. <strong style="color:#4ade80">Leader</strong> ≥5 articles · <strong style="color:#fbbf24">Active</strong> 2–4 · <strong style="color:var(--muted)">—</strong> 0–1.</div><div class="sdiv"></div></div>
${clsNotice}
${topicCards()}</section>

<section class="sec" id="appendix"><div class="sh"><div class="se">Section 05</div><h2 class="st">Citations</h2><div class="sd">All indexed articles. Verify any claim by following the URL.</div><div class="sdiv"></div></div>
${appendixSections}</section>

<section class="sec" id="em"><div class="sh"><div class="se">Section 06</div><h2 class="st">Emerging Narratives &amp; White-Space Gaps</h2><div class="sd">Topics gaining traction in the broader Indian AQ media landscape that the tracked organisations are not yet part of — identified by Claude Haiku.</div><div class="sdiv"></div></div>
${emergingCards}</section>

${buildSocialSection(socialResults, ORGS)}
${aeoSection()}

<section class="sec" id="score"><div class="sh"><div class="se">Section 09</div><h2 class="st">Competitive Scorecard</h2><div class="sd">Organisations ranked by weighted composite: media · LLM visibility · social presence.</div><div class="sdiv"></div></div>
<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="border-bottom:2px solid var(--border)">
  <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap">Rank</th>
  <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Organisation</th>
  <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap">AQ Press</th>
  <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Citation %</th>
  <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">AEO</th>
  <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap">YouTube ER</th>
  <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap">Social /10</th>
  <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--amber);white-space:nowrap">Score</th>
</tr></thead><tbody>${scorecardRows}</tbody></table></div></section>

<section class="sec" id="actions"><div class="sh"><div class="se">Section 10</div><h2 class="st">Action Matrix</h2><div class="sd">Data-anchored recommendations per org, generated by Claude Sonnet 4.6.</div><div class="sdiv"></div></div>
<table class="at"><thead><tr><th>Org</th><th>Priority</th><th>Area</th><th>Action</th><th>Data rationale</th></tr></thead><tbody>${actionRows}</tbody></table></section>

<footer class="rf">Generated by Emerald AI · AQ Intelligence Platform · ${now}<br>
Data: Serper News Index · Official Social Platform APIs · YouTube Data API v3 · ${tot} articles · ${esc(DATE_FROM)} to ${esc(DATE_TO)} · Orgs: ${esc(ORGS.join(', '))}<br>
AI Models: ${esc(modelsUsed || 'Claude Haiku 4.5 (classification & tagging) · Claude Sonnet 4.6 (analysis) · GPT-4o mini · Perplexity Sonar · Gemini 1.5 Flash (AEO visibility)')}<br>
<strong style="color:var(--text)">CONFIDENTIAL</strong> — prepared for ${esc(CLIENT_NAME || 'client')}</footer>
</main></div>
<script>
function td(id){var e=document.getElementById(id);if(!e)return;if(e.classList.contains('evd')){e.classList.toggle('open');}else{e.style.display=e.style.display==='none'?'block':'none';}}
var secs=document.querySelectorAll('.sec[id],header[id]');
var nis=document.querySelectorAll('.nav-a');
secs.forEach(function(s){new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){nis.forEach(function(n){n.classList.remove('active');});var a=document.querySelector('.nav-a[href="#'+e.target.id+'"]');if(a)a.classList.add('active');}});},{threshold:0.25,rootMargin:'-10% 0px -60% 0px'}).observe(s);});
function toggleExecDraft(){var d=document.getElementById('exec-draft');var ic=document.getElementById('exec-draft-icon');if(!d)return;var open=d.style.display!=='none';d.style.display=open?'none':'block';if(ic)ic.textContent=open?'\\u25bc Show draft':'\\u25b2 Hide draft';}
<\/script></body></html>`;
}

module.exports = { buildHTML };
