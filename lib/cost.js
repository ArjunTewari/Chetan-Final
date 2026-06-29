'use strict';
// Pricing as of mid-2025 (USD per 1M tokens unless noted)
const PRICES = {
  haiku_input:   0.80,
  haiku_output:  4.00,
  sonnet_input:  3.00,
  sonnet_output: 15.00,
  gpt4o_mini:    0.15,   // per 1M input tokens (output ~2x)
  perplexity:    1.00,   // sonar per 1M tokens
  gemini_flash:  0.075,  // per 1M tokens
  youtube_unit:  0.0001, // per API call ($0.10 per 1000)
  apidirect_unit: 0.001, // per API call (estimate)
};

function createTracker() {
  return {
    haiku_input_tokens:   0,
    haiku_output_tokens:  0,
    haiku_calls:          0,
    sonnet_input_tokens:  0,
    sonnet_output_tokens: 0,
    sonnet_calls:         0,
    openai_calls:         0,
    perplexity_calls:     0,
    gemini_calls:         0,
    youtube_calls:        0,
    apidirect_calls:      0,
  };
}

function addHaiku(tracker, inputTokens, outputTokens) {
  tracker.haiku_input_tokens  += inputTokens  || 0;
  tracker.haiku_output_tokens += outputTokens || 0;
  tracker.haiku_calls         += 1;
}

function addSonnet(tracker, inputTokens, outputTokens) {
  tracker.sonnet_input_tokens  += inputTokens  || 0;
  tracker.sonnet_output_tokens += outputTokens || 0;
  tracker.sonnet_calls         += 1;
}

function compute(tracker) {
  const claudeCost =
    (tracker.haiku_input_tokens  / 1e6) * PRICES.haiku_input +
    (tracker.haiku_output_tokens / 1e6) * PRICES.haiku_output +
    (tracker.sonnet_input_tokens  / 1e6) * PRICES.sonnet_input +
    (tracker.sonnet_output_tokens / 1e6) * PRICES.sonnet_output;

  const openaiCost     = (tracker.openai_calls     * 15 / 1e6) * PRICES.gpt4o_mini * 2;
  const perplexityCost = (tracker.perplexity_calls * 800 / 1e6) * PRICES.perplexity;
  const geminiCost     = (tracker.gemini_calls     * 500 / 1e6) * PRICES.gemini_flash;
  const youtubeCost    = tracker.youtube_calls * PRICES.youtube_unit;
  const apidirectCost  = tracker.apidirect_calls * PRICES.apidirect_unit;

  return {
    cost_claude:     +claudeCost.toFixed(4),
    cost_openai:     +openaiCost.toFixed(4),
    cost_perplexity: +perplexityCost.toFixed(4),
    cost_gemini:     +geminiCost.toFixed(4),
    cost_youtube:    +youtubeCost.toFixed(4),
    cost_apidirect:  +apidirectCost.toFixed(4),
    cost_total:      +(claudeCost + openaiCost + perplexityCost + geminiCost + youtubeCost + apidirectCost).toFixed(4),
    models_used: {
      haiku_calls:          tracker.haiku_calls,
      haiku_input_tokens:   tracker.haiku_input_tokens,
      haiku_output_tokens:  tracker.haiku_output_tokens,
      sonnet_calls:         tracker.sonnet_calls,
      sonnet_input_tokens:  tracker.sonnet_input_tokens,
      sonnet_output_tokens: tracker.sonnet_output_tokens,
      openai_calls:         tracker.openai_calls,
      perplexity_calls:     tracker.perplexity_calls,
      gemini_calls:         tracker.gemini_calls,
      youtube_calls:        tracker.youtube_calls,
      apidirect_calls:      tracker.apidirect_calls,
    },
  };
}

module.exports = { createTracker, addHaiku, addSonnet, compute };
