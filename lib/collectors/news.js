'use strict';
/**
 * news.js — AQ news article collector via Serper.dev News API
 * Approach: single general query per org (no source filter), Haiku YES/NO classification.
 */
const axios = require('axios');

const SERPER_URL  = 'https://google.serper.dev/news';
const CLAUDE_API  = 'https://api.anthropic.com/v1/messages';

const PR_WIRE_DOMAINS = ['prnewswire.com', 'businesswire.com', 'globenewswire.com', 'einpresswire.com', 'newswire.com'];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function classifyArticle(orgName, title, snippet, claudeKey) {
  if (!claudeKey) return true;
  try {
    const res = await axios.post(CLAUDE_API, {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system:     'Classify news coverage. Reply YES if the organisation is a meaningful actor (cited, quoted, authored, or acted on the topic). Reply NO if mentioned only in passing, in a list, or not about air quality at all.',
      messages: [{
        role:    'user',
        content: `Organisation: ${orgName}\nHeadline: ${title}\nSnippet: ${(snippet || '').slice(0, 400)}\n\nIs ${orgName} a meaningful actor in this article? YES or NO only.`,
      }],
    }, {
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return res.data.content?.[0]?.text?.trim().toUpperCase() === 'YES';
  } catch { return true; }
}

async function fetchArticles(orgName, dateFrom, dateTo, serperKey, claudeKey, cb) {
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  const toMs   = dateTo   ? new Date(dateTo).getTime()   : Date.now();

  const query = `${orgName} air quality pollution AQI India`;
  cb?.(`  News: querying Serper for ${orgName}…`);

  try {
    const res = await axios.post(SERPER_URL, {
      q:   query,
      gl:  'in',
      hl:  'en',
      num: 20,
    }, {
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const articles = res.data.news || [];

    const filtered = articles.filter(a => {
      // Date filter
      if (a.date) {
        try {
          const d = new Date(a.date);
          if (!isNaN(d.getTime())) {
            const ms = d.getTime();
            if (ms < fromMs || ms > toMs) return false;
          }
        } catch {}
      }
      // PR wire filter
      const domain = (a.link || '').replace('https://', '').replace('http://', '').split('/')[0];
      if (PR_WIRE_DOMAINS.some(d => domain.includes(d))) return false;
      // Org mention filter
      const text = ((a.title || '') + ' ' + (a.snippet || '')).toLowerCase();
      if (!text.includes(orgName.toLowerCase().split(' ')[0].toLowerCase())) return false;
      return true;
    });

    cb?.(`  News: ${orgName} — ${filtered.length} articles in period (from ${articles.length} raw)`);

    // Haiku classification in batches of 8
    const classified = [];
    for (let i = 0; i < filtered.length; i += 8) {
      const batch = filtered.slice(i, i + 8);
      const flags = await Promise.all(batch.map(a => classifyArticle(orgName, a.title, a.snippet, claudeKey)));
      flags.forEach((ok, j) => { if (ok) classified.push(batch[j]); });
      if (i + 8 < filtered.length) await sleep(300);
    }

    return classified.map(a => ({
      title:   a.title   || '',
      snippet: a.snippet || '',
      url:     a.link    || '',
      date:    a.date    || '',
      source:  a.source  || '',
    }));
  } catch (e) {
    const msg = e.response?.data?.error || e.response?.data?.message || e.message;
    cb?.(`  News: ${orgName} — ${msg}`, 'warn');
    return [];
  }
}

async function run(orgs, dateFrom, dateTo, serperKey, claudeKey, cb) {
  if (!serperKey) { cb?.('  News: no SERPER_KEY — skipping', 'warn'); return {}; }
  cb?.(`  News (Serper): collecting articles for ${orgs.length} orgs…`);
  const results = {};
  for (const orgName of orgs) {
    results[orgName] = await fetchArticles(orgName, dateFrom, dateTo, serperKey, claudeKey, cb);
    await sleep(400);
  }
  cb?.('  News (Serper): collection complete', 'ok');
  return results;
}

module.exports = { run };
