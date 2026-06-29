'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { createTracker, addHaiku, addSonnet, compute } = require('./cost');
const { buildHTML } = require('./build-html');
const { run: runAEO } = require('./aeo');
const newsCollector     = require('./collectors/news');
const twitterCollector  = require('./collectors/twitter');
const instagramCollector = require('./collectors/instagram');
const linkedinCollector = require('./collectors/linkedin');
const youtubeCollector  = require('./collectors/youtube');

const HAIKU  = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

const TOPICS = ['NCAP','Policy','PM2.5 Exposure','Stubble Burning','Clean Air Finance','Vehicular Pollution','Health Impact','Industrial Pollution','Heat-AQI','Brick Kilns','Petrol Emissions','Diesel Emissions','Super Emitters','Thermal Power Plants','Household Pollution','Indoor Pollution','Biomass Air Pollution','Rice Residue Burning','Wheat Residue Burning','Road Dust'];
const QUALITY_OPTIONS = ['Data Cited','Named Mention','Not in scraped text'];
const APIDIR_BASE = 'https://apidirect.io';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function tryParseJSON(text, fallback = []) {
  try {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[[\s\S]*\])/);
    return JSON.parse(match ? match[1] : text);
  } catch { return fallback; }
}

async function classifyArticles(org, articles, anthropic, tracker, cb) {
  if (!articles.length) return [];
  const results = new Array(articles.length).fill(null).map(() => ({ aq_subtopic: '', citation_quality: '' }));
  const BATCH = 8;
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    const items = batch.map((a, bi) =>
      `${i + bi}. "${(a.title || '').slice(0, 120)}" | source: ${a.source || 'unknown'} | snippet: "${(a.snippet || a.description || '').slice(0, 200)}"`
    ).join('\n');
    const prompt = `Classify each of these Indian air quality news articles. For each article return a JSON array with objects {"aq_subtopic": "<one of the 20 topics>", "citation_quality": "<one of 3 options>"}.

AQ subtopic options (pick the CLOSEST match):
${TOPICS.join(', ')}

Citation quality options:
- "Data Cited" — article cites specific data, stats, or research from a named org/institution
- "Named Mention" — org or expert is quoted or mentioned by name
- "Not in scraped text" — neither of the above

Articles:
${items}

Return ONLY a JSON array with exactly ${batch.length} objects, one per article. No other text.`;
    try {
      const msg = await anthropic.messages.create({
        model: HAIKU,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      });
      addHaiku(tracker, msg.usage.input_tokens, msg.usage.output_tokens);
      const parsed = tryParseJSON(msg.content[0]?.text || '[]', []);
      if (Array.isArray(parsed)) {
        parsed.forEach((c, bi) => {
          if (results[i + bi]) results[i + bi] = c;
        });
      }
    } catch (e) {
      cb?.(`  Classify batch ${i/BATCH+1} failed: ${e.message}`, 'warn');
    }
    if (i + BATCH < articles.length) await sleep(300);
  }
  return results;
}

async function detectSpikes(arts, orgs, dateFrom, dateTo, anthropic, tracker, cb) {
  const start = new Date(dateFrom), end = new Date(dateTo);
  const weeks = [];
  const cur = new Date(start);
  cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
  if (cur > start) cur.setDate(cur.getDate() - 7);
  while (cur <= end) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7); }

  const spikeAnnotations = [];
  for (const org of orgs) {
    const orgArts = arts[org] || [];
    const buckets = weeks.map((w, wi) => {
      const wEnd = new Date(w); wEnd.setDate(wEnd.getDate() + 7);
      return { w, wi, articles: orgArts.filter(a => { const d = parseDateStr(a.date||''); return d && d >= w && d < wEnd; }) };
    });
    const totalAvg = orgArts.length / Math.max(weeks.length, 1);
    for (const bucket of buckets) {
      if (bucket.articles.length >= Math.max(3, totalAvg * 1.8)) {
        const wLabel = `${String(bucket.w.getMonth()+1).padStart(2,'0')}-${String(bucket.w.getDate()).padStart(2,'0')}`;
        const titles = bucket.articles.slice(0,5).map(a => a.title || '').filter(Boolean);
        if (!titles.length) continue;
        try {
          const msg = await anthropic.messages.create({
            model: HAIKU,
            max_tokens: 120,
            messages: [{ role: 'user', content: `In one sentence (max 20 words), what likely triggered this spike of ${bucket.articles.length} news articles about "${org}" and air quality in the week of ${wLabel}?\n\nHeadlines:\n${titles.join('\n')}\n\nReturn just the one-sentence annotation, nothing else.` }],
          });
          addHaiku(tracker, msg.usage.input_tokens, msg.usage.output_tokens);
          const annotation = (msg.content[0]?.text || '').trim().replace(/^["']|["']$/g, '');
          spikeAnnotations.push({ org, wLabel, count: bucket.articles.length, articles: bucket.articles.slice(0,5), annotation });
        } catch { spikeAnnotations.push({ org, wLabel, count: bucket.articles.length, articles: bucket.articles.slice(0,5), annotation: '' }); }
        await sleep(200);
      }
    }
  }
  return spikeAnnotations;
}

async function findGaps(orgs, dateFrom, dateTo, apidirKey, claudeKey, arts, tracker, cb) {
  const anthropic = new Anthropic({ apiKey: claudeKey });
  // Gather all tracked article titles
  const trackedTitles = orgs.flatMap(o => (arts[o]||[]).map(a => a.title||'')).filter(Boolean);

  // Fetch general AQ India news (not org-specific)
  let generalArts = [];
  if (apidirKey) {
    try {
      const res = await axios.get(`${APIDIR_BASE}/v1/news/articles`, {
        params: { query: 'air quality pollution India AQI PM2.5 NCAP', limit: 50 },
        headers: { 'X-API-Key': apidirKey },
        timeout: 30000,
      });
      const items = res.data.articles || res.data.results || res.data.data || [];
      const fromMs = new Date(dateFrom).getTime(), toMs = new Date(dateTo).getTime();
      generalArts = items.filter(a => {
        const d = parseDateStr(a.date || a.publishedAt || '');
        if (!d) return true;
        return d.getTime() >= fromMs && d.getTime() <= toMs;
      }).map(a => a.title || '').filter(Boolean);
    } catch (e) { cb?.(`  Gaps: general query failed — ${e.message}`, 'warn'); }
  }

  if (!generalArts.length) generalArts = trackedTitles;

  const uniqueGeneral = [...new Set(generalArts)].slice(0, 30);
  const prompt = `You are an Indian air quality media analyst. Below are two sets of article headlines:

GENERAL AQ MEDIA (broader landscape):
${uniqueGeneral.map((t,i) => `${i+1}. ${t}`).join('\n')}

TRACKED ORG COVERAGE:
${trackedTitles.slice(0,20).map((t,i) => `${i+1}. ${t}`).join('\n')}

Identify 2-3 emerging AQ topics or narratives that appear in the general landscape but are notably absent from tracked org coverage. These are "white-space gaps" — opportunities the tracked orgs are missing.

Return a JSON array of objects:
{"topic": "Short topic name", "description": "2-3 sentence description of the gap and why it matters", "gap_signal": "What evidence suggests this is growing", "opportunity": "What action could close this gap", "supporting_articles": [{"title": "headline", "url": ""}]}

Return ONLY a JSON array. No other text.`;

  try {
    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });
    addHaiku(tracker, msg.usage.input_tokens, msg.usage.output_tokens);
    const parsed = tryParseJSON(msg.content[0]?.text || '[]', []);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (e) {
    cb?.(`  Gaps: Haiku call failed — ${e.message}`, 'warn');
    return [];
  }
}

async function genExecFindings(orgs, data, claudeKey, tracker, cb) {
  const anthropic = new Anthropic({ apiKey: claudeKey });
  const summary = orgs.map(o => {
    const d = data[o] || {};
    return `${o}: ${d.total||0} AQ articles, ${d.dataPct||0}% data-cited, top topics: ${Object.entries(d.topicCounts||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>`${t}(${n})`).join(', ')}, AEO: ${d.aeo||0} LLM mentions`;
  }).join('\n');
  const prompt = `You are an Indian air quality media strategist. Based on this coverage data for ${orgs.length} organisations, write 3 sharp executive findings.

DATA:
${summary}

Each finding should be a concrete insight about competitive positioning, coverage gaps, or strategic opportunities — not a restatement of raw numbers.

Return a JSON array of 3 objects:
{"headline": "Max 12-word punchy headline", "detail": "2-3 sentence evidence-backed insight", "section_ref": "§section-id"}

section_ref can be: §03 (press), §03c (momentum), §04 (topics), §08 (social), §09 (aeo), §10 (scorecard)

Return ONLY a JSON array. No other text.`;
  try {
    const msg = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    addSonnet(tracker, msg.usage.input_tokens, msg.usage.output_tokens);
    const parsed = tryParseJSON(msg.content[0]?.text || '[]', []);
    return Array.isArray(parsed) ? parsed.slice(0,3) : [];
  } catch (e) {
    cb?.(`  Exec findings: Sonnet call failed — ${e.message}`, 'warn');
    return [];
  }
}

async function genActionMatrix(orgs, data, claudeKey, tracker, cb) {
  const anthropic = new Anthropic({ apiKey: claudeKey });
  const summary = orgs.map(o => {
    const d = data[o] || {};
    const weakTopics = Object.entries(d.topicCounts||{}).sort((a,b)=>a[1]-b[1]).slice(0,3).map(([t])=>t).join(', ');
    return `${o}: ${d.total||0} articles, ${d.dataPct||0}% data-cited, weak topics: ${weakTopics||'none'}, AEO: ${d.aeo||0}`;
  }).join('\n');
  const prompt = `You are an Indian air quality communications strategist. Based on this data, create a specific action matrix for each organisation.

DATA:
${summary}

For each org, recommend exactly ONE high-priority action.

Priority options: "Fix Now" (urgent gap), "Leverage" (exploit existing strength), "Optimise" (improve current activity), "Invest" (new capability needed)

Return a JSON array of objects:
{"org": "Organisation name", "priority": "Fix Now|Leverage|Optimise|Invest", "area": "Content|Social|AEO|Data|Partnerships", "action": "Specific 1-sentence action", "rationale": "Data-grounded reason in 1 sentence"}

Return ONLY a JSON array, one object per org. No other text.`;
  try {
    const msg = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    addSonnet(tracker, msg.usage.input_tokens, msg.usage.output_tokens);
    const parsed = tryParseJSON(msg.content[0]?.text || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    cb?.(`  Action matrix: Sonnet call failed — ${e.message}`, 'warn');
    return [];
  }
}

function computeSocialScore(social) {
  if (!social) return 0;
  let pts = 0;
  const x = social.x || {};
  const ig = social.ig || {};
  const li = social.li || {};
  const yt = social.yt || {};
  if ((x.aqPosts||0) > 5)  pts += 2;
  else if ((x.aqPosts||0) > 0)  pts += 1;
  if ((ig.aqPosts||0) > 5) pts += 2;
  else if ((ig.aqPosts||0) > 0) pts += 1;
  if ((li.totalPosts||0) > 5) pts += 2;
  else if ((li.totalPosts||0) > 0) pts += 1;
  if ((yt.videoCount||0) > 2) pts += 2;
  else if ((yt.videoCount||0) > 0) pts += 1;
  return Math.min(10, pts);
}

/**
 * Main pipeline
 * @param {string[]} orgs
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {string} clientName
 * @param {Record<string,string>} env - CLAUDE_KEY, APIDIRECT_KEY, YOUTUBE_KEY, OPENAI_KEY, PERPLEXITY_KEY, GEMINI_KEY
 * @param {(msg:string, level?:string)=>void} cb - log callback
 */
async function run(orgs, dateFrom, dateTo, clientName, env, cb) {
  const tracker = createTracker();
  const claudeKey     = env.CLAUDE_KEY;
  const apidirKey     = env.APIDIRECT_KEY;
  const ytKey         = env.YOUTUBE_KEY;
  const openaiKey     = env.OPENAI_KEY;
  const perplexityKey = env.PERPLEXITY_KEY;
  const geminiKey     = env.GEMINI_KEY;

  if (!claudeKey) throw new Error('CLAUDE_KEY not configured');

  const anthropic = new Anthropic({ apiKey: claudeKey });

  cb?.('Pipeline started — collecting data for ' + orgs.length + ' organisations');

  // 1. News collection
  cb?.('[1/8] Collecting news (Serper News Index)…');
  const arts = await newsCollector.run(orgs, dateFrom, dateTo, apidirKey, claudeKey, cb, tracker);

  // 2. Social collection (parallel)
  cb?.('[2/8] Collecting social data (Official APIs)…');
  const [xResults, igResults, liResults, ytResults] = await Promise.all([
    twitterCollector.run(orgs, dateFrom, dateTo, apidirKey, cb),
    instagramCollector.run(orgs, dateFrom, dateTo, apidirKey, claudeKey, cb, tracker),
    linkedinCollector.run(orgs, dateFrom, dateTo, apidirKey, cb),
    youtubeCollector.run(orgs, dateFrom, dateTo, ytKey, cb),
  ]);
  const socialResults = {};
  for (const org of orgs) {
    socialResults[org] = {
      x:  xResults[org]  || {},
      ig: igResults[org] || {},
      li: liResults[org] || {},
      yt: ytResults[org] || {},
    };
    tracker.apidirect_calls += 3; // twitter + ig + li calls (estimated)
    if (ytResults[org]) tracker.youtube_calls += 3;
  }

  // 3. Topic + citation classification
  cb?.('[3/8] Classifying articles (Claude Haiku)…');
  const data = {};
  for (const org of orgs) {
    const orgArts = arts[org] || [];
    cb?.(`  Classifying ${orgArts.length} articles for ${org}…`);
    const classifications = await classifyArticles(org, orgArts, anthropic, tracker, cb);
    const outletCounts = {};
    const topicCounts  = {};
    orgArts.forEach(a => {
      const outlet = canonOutlet(a.source || '');
      if (outlet) outletCounts[outlet] = (outletCounts[outlet] || 0) + 1;
    });
    classifications.forEach(c => {
      const t = (c.aq_subtopic || '').trim();
      if (t) topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
    const classified = classifications.filter(c => c.citation_quality && c.citation_quality !== '').length;
    const dataCited  = classifications.filter(c => c.citation_quality === 'Data Cited').length;
    const dataPct    = classified > 0 ? Math.round((dataCited / classified) * 100) : 0;
    data[org] = { total: orgArts.length, classified, sov: orgArts.length, dataPct, outletCounts, topicCounts, classifications };
  }

  // 4. Spike detection
  cb?.('[4/8] Detecting coverage spikes (Claude Haiku)…');
  const spikeAnnotations = await detectSpikes(arts, orgs, dateFrom, dateTo, anthropic, tracker, cb);
  cb?.(`  Found ${spikeAnnotations.length} spike(s)`, spikeAnnotations.length > 0 ? 'ok' : 'warn');

  // 5. AEO probing
  cb?.('[5/8] AEO — probing LLM visibility…');
  const aeoResults = await runAEO(orgs, openaiKey, perplexityKey, geminiKey, cb, tracker);

  // 6. White-space gaps
  cb?.('[6/8] Finding white-space gaps (Claude Haiku)…');
  const emerging = await findGaps(orgs, dateFrom, dateTo, apidirKey, claudeKey, arts, tracker, cb);
  cb?.(`  Found ${emerging.length} gap(s)`, 'ok');

  // 7. Exec findings + action matrix (Sonnet)
  cb?.('[7/8] Generating executive findings (Claude Sonnet 4.6)…');
  const execFindings = await genExecFindings(orgs, data, claudeKey, tracker, cb);
  const actions      = await genActionMatrix(orgs, data, claudeKey, tracker, cb);

  // Compute composite scores
  orgs.forEach(org => {
    const d = data[org] || {};
    const aeoScore    = aeoResults[org]?.mentions || 0;
    const socialScore = computeSocialScore(socialResults[org]);
    d.aeo    = aeoScore;
    d.social = socialScore;
    d.score  = Math.round(d.sov * 0.5 + aeoScore * 2 + socialScore * 2 + (d.dataPct || 0) * 0.2);
  });

  // 8. Build HTML
  cb?.('[8/8] Building HTML report…');
  const modelsUsed = [
    'Claude Haiku 4.5 (classification & topic tagging)',
    'Claude Sonnet 4.6 (executive analysis)',
    openaiKey     ? 'GPT-4o mini (AEO)'         : null,
    perplexityKey ? 'Perplexity Sonar (AEO)'    : null,
    geminiKey     ? 'Gemini 1.5 Flash (AEO)'    : null,
    'YouTube Data API v3',
    'Official Social Platform APIs',
    'Serper News Index',
  ].filter(Boolean).join(' · ');

  const html = buildHTML({
    ORGS: orgs,
    DATE_FROM: dateFrom,
    DATE_TO:   dateTo,
    CLIENT_NAME: clientName || 'Client',
    data,
    arts,
    aeoResults,
    socialResults,
    emerging,
    execFindings,
    actions,
    spikeAnnotations,
    modelsUsed,
  });

  const costs       = compute(tracker);
  const articleCount = orgs.reduce((s, o) => s + (data[o]?.total || 0), 0);

  cb?.(`Pipeline complete — ${articleCount} articles · cost $${costs.cost_total}`, 'ok');
  return { html, costs, articleCount };
}

module.exports = { run };
