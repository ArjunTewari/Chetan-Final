'use strict';
const axios = require('axios');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

async function probeGPT(question, apiKey, tracker) {
  if (!apiKey) return '';
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [{ role: 'user', content: question }],
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    if (tracker) tracker.openai_calls++;
    return res.data.choices?.[0]?.message?.content || '';
  } catch { return ''; }
}

async function probePerplexity(question, apiKey, tracker) {
  if (!apiKey) return '';
  try {
    const res = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar',
      max_tokens: 300,
      messages: [{ role: 'user', content: question }],
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    if (tracker) tracker.perplexity_calls++;
    return res.data.choices?.[0]?.message?.content || '';
  } catch { return ''; }
}

async function probeGemini(question, apiKey, tracker) {
  if (!apiKey) return '';
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: question }] }] },
      { timeout: 20000 }
    );
    if (tracker) tracker.gemini_calls++;
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch { return ''; }
}

function countMentions(text, orgName) {
  if (!text) return 0;
  const words = orgName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return words.some(w => text.toLowerCase().includes(w)) ? 1 : 0;
}

async function run(orgs, openaiKey, perplexityKey, geminiKey, cb, tracker) {
  const hasAnyKey = openaiKey || perplexityKey || geminiKey;
  if (!hasAnyKey) {
    cb?.('  AEO: no LLM keys configured — skipping', 'warn');
    return orgs.reduce((acc, org) => { acc[org] = { mentions: 0, score: 0, llmBreakdown: {} }; return acc; }, {});
  }

  const llmNames = [];
  if (openaiKey)     llmNames.push('GPT-4o mini');
  if (perplexityKey) llmNames.push('Perplexity Sonar');
  if (geminiKey)     llmNames.push('Gemini 1.5 Flash');

  cb?.(`  AEO: probing ${AEO_QUESTIONS.length} questions × ${llmNames.length} LLMs (${llmNames.join(', ')})…`);

  const results = orgs.reduce((acc, org) => {
    acc[org] = { mentions: 0, score: 0, llmBreakdown: {}, topResponse: '' };
    for (const llm of llmNames) acc[org].llmBreakdown[llm] = { mentions: 0, total: AEO_QUESTIONS.length };
    return acc;
  }, {});

  for (let qi = 0; qi < AEO_QUESTIONS.length; qi++) {
    const q = AEO_QUESTIONS[qi];
    cb?.(`  AEO: Q${qi + 1}/${AEO_QUESTIONS.length}…`);

    const [gptAns, pplxAns, gemAns] = await Promise.all([
      probeGPT(q, openaiKey, tracker),
      probePerplexity(q, perplexityKey, tracker),
      probeGemini(q, geminiKey, tracker),
    ]);

    const answers = [
      openaiKey     ? { llm: 'GPT-4o mini',       text: gptAns  } : null,
      perplexityKey ? { llm: 'Perplexity Sonar',   text: pplxAns } : null,
      geminiKey     ? { llm: 'Gemini 1.5 Flash',   text: gemAns  } : null,
    ].filter(Boolean);

    for (const org of orgs) {
      for (const { llm, text } of answers) {
        const mentioned = countMentions(text, org);
        if (mentioned) {
          results[org].mentions++;
          results[org].llmBreakdown[llm].mentions++;
          if (!results[org].topResponse) results[org].topResponse = text.slice(0, 400);
        }
      }
    }

    if (qi < AEO_QUESTIONS.length - 1) await sleep(500);
  }

  const totalQuestions = AEO_QUESTIONS.length * llmNames.length;
  for (const org of orgs) {
    results[org].score = totalQuestions > 0 ? Math.round((results[org].mentions / totalQuestions) * 100) : 0;
  }

  cb?.(`  AEO: probing complete`, 'ok');
  return results;
}

module.exports = { run, AEO_QUESTIONS };
