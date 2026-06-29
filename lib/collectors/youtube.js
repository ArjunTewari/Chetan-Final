'use strict';
const axios      = require('axios');
const ORG_SOCIAL = require('../org-handles');

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

const AQ_KEYWORDS = ['air quality', 'air pollution', 'pm2.5', 'aqi', 'smog', 'clean air', 'ncap', 'emission', 'pollution'];

function isAQTitle(title) {
  const lower = (title || '').toLowerCase();
  return AQ_KEYWORDS.some(kw => lower.includes(kw));
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchOrgYTData(orgName, channelId, dateFrom, dateTo, ytKey, cb) {
  if (!channelId) return { channelId: null, videoCount: 0, videos: [], avgER: 0, avgViewER: 0 };

  try {
    // Get channel stats
    const chanRes = await axios.get(`${YT_API_BASE}/channels`, {
      params: { part: 'statistics', id: channelId, key: ytKey },
      timeout: 15000,
    });
    const chanStats = chanRes.data.items?.[0]?.statistics || {};
    const subscribers = parseInt(chanStats.subscriberCount || '0');
    const subscribersHidden = chanStats.hiddenSubscriberCount;

    // Search for videos in date range
    const searchRes = await axios.get(`${YT_API_BASE}/search`, {
      params: {
        part:        'snippet',
        channelId,
        type:        'video',
        maxResults:  50,
        publishedAfter:  dateFrom ? new Date(dateFrom).toISOString() : undefined,
        publishedBefore: dateTo   ? new Date(dateTo).toISOString()   : undefined,
        key: ytKey,
      },
      timeout: 20000,
    });

    const items = searchRes.data.items || [];
    const videoIds = items
      .filter(i => isAQTitle(i.snippet?.title))
      .map(i => i.id?.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) return { channelId, subscribers, videoCount: 0, videos: [], avgER: 0, avgViewER: 0 };

    // Fetch video stats in batches of 50
    const statsRes = await axios.get(`${YT_API_BASE}/videos`, {
      params: { part: 'statistics,snippet', id: videoIds.join(','), key: ytKey },
      timeout: 20000,
    });

    const videos = (statsRes.data.items || []).map(v => {
      const s = v.statistics || {};
      const views    = parseInt(s.viewCount    || '0');
      const likes    = parseInt(s.likeCount    || '0');
      const comments = parseInt(s.commentCount || '0');
      const subscriberER = (!subscribersHidden && subscribers > 0) ? ((likes + comments) / subscribers * 100) : null;
      const viewER       = views > 0 ? ((likes + comments) / views * 100) : null;
      return {
        videoId:      v.id,
        url:          `https://youtube.com/watch?v=${v.id}`,
        title:        v.snippet?.title || '',
        publishedAt:  v.snippet?.publishedAt || '',
        subscribers,
        views,
        likes,
        comments,
        subscriberER,
        viewER,
        erMethod:     subscriberER !== null ? 'subscriber' : viewER !== null ? 'view' : 'none',
      };
    });

    const erVals = videos.map(v => v.subscriberER).filter(v => v !== null);
    const viewERVals = videos.map(v => v.viewER).filter(v => v !== null);
    const avgER     = erVals.length     ? erVals.reduce((a, b) => a + b, 0) / erVals.length         : 0;
    const avgViewER = viewERVals.length ? viewERVals.reduce((a, b) => a + b, 0) / viewERVals.length  : 0;

    return { channelId, subscribers, videoCount: videos.length, videos, avgER, avgViewER };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    cb?.(`  YT: ${orgName} — ${msg}`, 'warn');
    return { channelId, subscribers: 0, videoCount: 0, videos: [], avgER: 0, avgViewER: 0, error: msg };
  }
}

async function run(orgs, dateFrom, dateTo, ytKey, cb, extraHandles = {}) {
  if (!ytKey) { cb?.('  YouTube: no YOUTUBE_KEY — skipping', 'warn'); return {}; }
  cb?.(`  YouTube (Data API v3): collecting for ${orgs.length} orgs…`);
  const results = {};
  for (const orgName of orgs) {
    const channelId = extraHandles[orgName]?.youtube || ORG_SOCIAL[orgName]?.youtube;
    cb?.(`  YT: ${orgName}${channelId ? '' : ' (no channel ID — skipping)'}…`);
    results[orgName] = await fetchOrgYTData(orgName, channelId, dateFrom, dateTo, ytKey, cb);
    if (channelId) cb?.(`  YT → ${orgName}: ${results[orgName].videoCount} AQ videos`, results[orgName].videoCount > 0 ? 'ok' : 'warn');
    await sleep(300);
  }
  cb?.('  YouTube (Data API v3): collection complete', 'ok');
  return results;
}

module.exports = { run };
