'use strict';
const axios      = require('axios');
const ORG_SOCIAL = require('../org-handles');

const APIDIR_BASE = 'https://apidirect.io';
const CLAUDE_API  = 'https://api.anthropic.com/v1/messages';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function classifyPost(text, claudeKey) {
  if (!text || !claudeKey) return false;
  try {
    const res = await axios.post(CLAUDE_API, {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system:     'You classify social media posts. Reply with only YES or NO.',
      messages: [{
        role:    'user',
        content: `Is this post about air quality, air pollution, AQI, PM2.5, smog, clean air, emissions, or environmental air health?\n\nPost: "${text.slice(0, 500)}"\n\nAnswer YES or NO only.`,
      }],
    }, {
      headers: {
        'x-api-key':         claudeKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      timeout: 15000,
    });
    return res.data.content?.[0]?.text?.trim().toUpperCase() === 'YES';
  } catch { return false; }
}

async function fetchOrgXData(orgName, handle, dateFrom, dateTo, apidirKey, claudeKey, cb) {
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  const toMs   = dateTo   ? new Date(dateTo  ).getTime() : Date.now();

  try {
    const res = await axios.get(`${APIDIR_BASE}/v1/twitter/user/tweets`, {
      params:  { username: handle, pages: 3 },
      headers: { 'X-API-Key': apidirKey },
      timeout: 30000,
    });

    const tweets = res.data.tweets || res.data.posts || [];

    const inPeriod = tweets.filter(t => {
      if (!t.date) return true;
      try {
        const d = new Date(t.date);
        if (isNaN(d.getTime())) return true;
        return d.getTime() >= fromMs && d.getTime() <= toMs;
      } catch { return true; }
    });

    cb?.(`  X: @${handle} fetched ${tweets.length} tweets, ${inPeriod.length} in period`);

    const aqTweets = [];
    if (inPeriod.length > 0) {
      const normed = inPeriod.map(t => ({ ...t, _text: t.snippet || t.title || '' }));
      for (let i = 0; i < normed.length; i += 5) {
        const batch = normed.slice(i, i + 5);
        const flags = await Promise.all(batch.map(t => classifyPost(t._text, claudeKey)));
        flags.forEach((isAQ, j) => { if (isAQ) aqTweets.push(batch[j]); });
        if (i + 5 < normed.length) await sleep(400);
      }
    }

    const followers    = res.data.user?.followers_count || res.data.followers || 0;
    const totalLikes   = aqTweets.reduce((s, t) => s + (t.likes   || 0), 0);
    const totalReplies = aqTweets.reduce((s, t) => s + (t.replies || 0), 0);

    const topPosts = aqTweets
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 3)
      .map(t => ({
        text:       t._text,
        likes:      t.likes    || 0,
        replies:    t.replies  || 0,
        reposts:    t.retweets || 0,
        views:      t.views    || 0,
        created_at: t.date     || '',
        url:        t.url      || `https://x.com/${handle}`,
      }));

    return {
      handle,
      followers,
      totalPosts:  inPeriod.length,
      aqPosts:     aqTweets.length,
      totalLikes,
      totalReplies,
      topPosts,
    };
  } catch (e) {
    const msg = e.response?.data?.error || e.response?.data?.message || e.message;
    cb?.(`  X: @${handle} — ${msg}`, 'warn');
    return { handle, followers: 0, totalPosts: 0, aqPosts: 0, totalLikes: 0, totalReplies: 0, topPosts: [], error: msg };
  }
}

async function run(orgs, dateFrom, dateTo, apidirKey, claudeKey, cb, extraHandles = {}) {
  if (!apidirKey) { cb?.('  X: no APIDIRECT_KEY — skipping', 'warn'); return {}; }
  if (!claudeKey) { cb?.('  X: no CLAUDE_KEY — AQ classification will be skipped', 'warn'); }
  cb?.(`  X (Official API): collecting tweets for ${orgs.length} orgs…`);
  const results = {};
  for (const orgName of orgs) {
    const handle = extraHandles[orgName]?.twitter || ORG_SOCIAL[orgName]?.twitter;
    if (!handle) {
      cb?.(`  X: no handle for "${orgName}" — skipping`, 'warn');
      results[orgName] = { handle: null, followers: 0, totalPosts: 0, aqPosts: 0, totalLikes: 0, totalReplies: 0, topPosts: [] };
      continue;
    }
    cb?.(`  X: @${handle} (${orgName})…`);
    results[orgName] = await fetchOrgXData(orgName, handle, dateFrom, dateTo, apidirKey, claudeKey, cb);
    const r = results[orgName];
    cb?.(
      `  X → ${orgName}: ${r.aqPosts} AQ posts / ${r.totalPosts} in period (${(r.followers || 0).toLocaleString()} followers)`,
      r.aqPosts > 0 ? 'ok' : 'warn'
    );
    await sleep(500);
  }
  cb?.('  X (Official API): collection complete', 'ok');
  return results;
}

module.exports = { run };
