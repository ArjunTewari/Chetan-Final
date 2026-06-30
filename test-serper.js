'use strict';
const https = require('https');

const KEY  = process.env.SERPER_KEY || 'd9e599485cb848a9efa866537e4c46c419c02da8';
const ORG  = 'IIT Delhi';
const QUERY = `${ORG} air quality pollution AQI India`;

const body = JSON.stringify({ q: QUERY, gl: 'in', hl: 'en', num: 20 });

const options = {
  hostname: 'google.serper.dev',
  path:     '/news',
  method:   'POST',
  headers:  {
    'X-API-KEY':      KEY,
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

console.log('Key length  :', KEY.length);
console.log('Key prefix  :', KEY.slice(0, 8));
console.log('Key suffix  :', KEY.slice(-4));
console.log('Query       :', QUERY);
console.log('Sending request to google.serper.dev/news ...\n');

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('HTTP status :', res.statusCode);
    try {
      const json = JSON.parse(data);
      if (res.statusCode !== 200) {
        console.log('ERROR body  :', JSON.stringify(json));
      } else {
        const articles = json.news || [];
        console.log('Articles    :', articles.length);
        if (articles[0]) {
          console.log('First title :', articles[0].title);
          console.log('First source:', articles[0].source);
          console.log('First date  :', articles[0].date);
        }
      }
    } catch {
      console.log('Raw response:', data.slice(0, 300));
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
