'use strict';
const axios      = require('axios');
const ORG_SOCIAL = require('../org-handles');

const APIDIR_BASE = 'https://apidirect.io';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchLinkedIn(orgName, liUrl, dateFrom, dateTo, apidirKey, cb) {
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  const toMs   = dateTo   ? new Date(dateTo).getTime()   : Date.now();

  try {
    const res = await axios.get(`${APIDIR_BASE}/v1/linkedin/company/posts`, {
      params:  { url: liUrl, page: 1 },
      headers: { 'X-API-Key': apidirKey },
      timeout: 30000,
    });

    const posts = res.data.posts || res.data.data || [];
    const inPeriod = posts.filter(p => {
      if (!p.date && !p.postedAt) return true;
      try {
        const d = new Date(p.date || p.postedAt);
        if (isNaN(d.getTime())) return true;
        return d.getTime() >= fromMs && d.getTime() <= toMs;
      } catch { return true; }
    });

    const followers = res.data.company?.followers || res.data.followers || 0;
    const totalLikes = inPeriod.reduce((s, p) => s + (p.likes || p.numLikes || 0), 0);

    return { url: liUrl, followers, totalPosts: inPeriod.length, totalLikes, posts: inPeriod };
  } catch (e) {
    const msg = e.response?.data?.error || e.response?.data?.message || e.message;
    cb?.(`  LI: ${orgName} — ${msg}`, 'warn');
    return { url: liUrl, followers: 0, totalPosts: 0, totalLikes: 0, posts: [], error: msg };
  }
}

async function run(orgs, dateFrom, dateTo, apidirKey, cb, extraHandles = {}) {
  if (!apidirKey) { cb?.('  LinkedIn: no APIDIRECT_KEY — skipping', 'warn'); return {}; }
  cb?.(`  LinkedIn (Official API): collecting posts for ${orgs.length} orgs…`);
  const results = {};
  for (const orgName of orgs) {
    const liUrl = extraHandles[orgName]?.linkedin || ORG_SOCIAL[orgName]?.linkedin;
    if (!liUrl) {
      cb?.(`  LI: no LinkedIn URL for "${orgName}" — skipping`, 'warn');
      results[orgName] = { url: null, followers: 0, totalPosts: 0, totalLikes: 0, posts: [] };
      continue;
    }
    cb?.(`  LI: ${orgName}…`);
    results[orgName] = await fetchLinkedIn(orgName, liUrl, dateFrom, dateTo, apidirKey, cb);
    cb?.(`  LI → ${orgName}: ${results[orgName].totalPosts} posts in period`, 'ok');
    await sleep(400);
  }
  cb?.('  LinkedIn (Official API): collection complete', 'ok');
  return results;
}

module.exports = { run };
