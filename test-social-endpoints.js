'use strict';
/**
 * test-social-endpoints.js — diagnose APIDirectio social endpoints
 *
 * Usage:
 *   APIDIRECT_KEY=xxx node test-social-endpoints.js
 *
 * Shows raw response shape and field names for each platform.
 * Run this to confirm what fields the API actually returns.
 */

const axios = require('axios');
const API_BASE = 'https://apidirect.io';

const KEY = process.env.APIDIRECT_KEY;
if (!KEY) { console.error('❌  Set APIDIRECT_KEY=xxx before running'); process.exit(1); }

function pretty(obj) {
  if (!obj) return 'null';
  const keys = Object.keys(obj);
  return `{ ${keys.slice(0, 12).map(k => {
    const v = obj[k];
    if (typeof v === 'string') return `${k}: "${v.slice(0, 40)}${v.length > 40 ? '…' : ''}"`;
    return `${k}: ${JSON.stringify(v)}`;
  }).join(', ')}${keys.length > 12 ? ` … +${keys.length - 12} more` : ''} }`;
}

async function test(label, path, params) {
  console.log(`\n── ${label} ──`);
  console.log(`   GET ${API_BASE}${path}`);
  console.log(`   params: ${JSON.stringify(params)}`);
  try {
    const res = await axios.get(`${API_BASE}${path}`, {
      params,
      headers: { 'X-API-Key': KEY },
      timeout: 30000,
    });
    const d = res.data;
    console.log(`   Status: ${res.status} ✓`);
    console.log(`   Top-level keys: ${Object.keys(d).join(', ')}`);

    // Find the array field
    const arrField = Object.keys(d).find(k => Array.isArray(d[k]));
    if (arrField) {
      const items = d[arrField];
      console.log(`   Array field: "${arrField}" — ${items.length} items`);
      if (items.length > 0) {
        console.log(`   First item shape: ${pretty(items[0])}`);
        const textField = ['text', 'snippet', 'title', 'caption', 'content', 'description']
          .find(f => items[0][f]);
        console.log(`   Text field: ${textField ? `"${textField}" = "${String(items[0][textField]).slice(0,80)}"` : '⚠ NONE FOUND — tweet text missing'}`);
        const dateField = ['date', 'created_at', 'postedAt', 'publishedAt'].find(f => items[0][f]);
        console.log(`   Date field: ${dateField ? `"${dateField}" = "${items[0][dateField]}"` : '⚠ NONE FOUND'}`);
      } else {
        console.log('   ⚠ Array is empty — no posts returned');
      }
    } else {
      console.log('   ⚠ No array field found in response');
    }

    // User/followers field
    const userLike = d.user || d.profile || d.channel;
    if (userLike) {
      const fol = userLike.followers_count || userLike.followers || userLike.subscriberCount;
      console.log(`   Followers: ${fol ?? '(field not found)'}`);
    }
  } catch (e) {
    const status = e.response?.status;
    const body   = e.response?.data;
    console.log(`   ❌ ${status || 'NETWORK'} — ${e.message}`);
    if (body) console.log(`   Response body: ${JSON.stringify(body).slice(0, 200)}`);
  }
}

async function main() {
  console.log('=== APIDirectio Endpoint Diagnostic ===');
  console.log(`Key: ${KEY.slice(0, 8)}…`);

  await test(
    'Twitter — User Tweets (@CEEWIndia)',
    '/v1/twitter/user/tweets',
    { username: 'CEEWIndia', pages: 1 }
  );

  await test(
    'Instagram — User Posts (@ceewindia)',
    '/v1/instagram/user/posts',
    { username: 'ceewindia', pages: 1 }
  );

  await test(
    'LinkedIn — Company Posts (CEEW)',
    '/v1/linkedin/company/posts',
    { url: 'https://www.linkedin.com/company/council-on-energy-environment-and-water/', page: 1 }
  );

  console.log('\n=== Done ===');
  console.log('\nFix notes:');
  console.log('  • Twitter text field: collector uses t.snippet || t.title');
  console.log('  • Instagram text field: collector uses p.snippet || p.title');
  console.log('  • LinkedIn text field: collector uses p.text || p.snippet');
  console.log('  If "Text field: NONE FOUND" above, update the field names in the collectors.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
