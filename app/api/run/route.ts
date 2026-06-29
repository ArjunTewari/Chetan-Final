import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { run: runPipeline } = require('../../../lib/pipeline');

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      const cb = (msg: string, level?: string) => {
        try {
          send('log', JSON.stringify({ msg, level: level || 'info' }));
        } catch {}
      };

      try {
        // Auth check
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          send('error', JSON.stringify({ msg: 'Not authenticated' }));
          controller.close();
          return;
        }

        // Parse body
        let body: { orgs?: string[]; dateFrom?: string; dateTo?: string };
        try {
          body = await request.json();
        } catch {
          send('error', JSON.stringify({ msg: 'Invalid request body' }));
          controller.close();
          return;
        }

        const { orgs, dateFrom, dateTo } = body;
        if (!orgs?.length || !dateFrom || !dateTo) {
          send('error', JSON.stringify({ msg: 'orgs, dateFrom, dateTo are required' }));
          controller.close();
          return;
        }

        const env = {
          CLAUDE_KEY:      process.env.CLAUDE_KEY,
          APIDIRECT_KEY:   process.env.APIDIRECT_KEY,
          YOUTUBE_KEY:     process.env.YOUTUBE_KEY,
          OPENAI_KEY:      process.env.OPENAI_KEY,
          PERPLEXITY_KEY:  process.env.PERPLEXITY_KEY,
          GEMINI_KEY:      process.env.GEMINI_KEY,
        };

        const started = Date.now();
        cb(`Starting report for: ${orgs.join(', ')} | ${dateFrom} → ${dateTo}`);

        const sectionCb = (sec: { id: string; title: string; summary: string }) => {
          try { send('section', JSON.stringify(sec)); } catch {}
        };

        const { html, costs, articleCount } = await runPipeline(
          orgs, dateFrom, dateTo, user.email, env, cb, sectionCb
        );

        const duration_s = Math.round((Date.now() - started) / 1000);

        // Save to Supabase
        let reportId: string | null = null;
        try {
          const svc = createServiceClient();
          const { data: logRow } = await svc.from('report_logs').insert({
            user_id:       user.id,
            organizations: orgs,
            date_from:     dateFrom,
            date_to:       dateTo,
            html_name:     `aq-report-${new Date().toISOString().slice(0,10)}.html`,
            cost_apidirect:  costs.cost_apidirect,
            cost_claude:     costs.cost_claude,
            cost_openai:     costs.cost_openai,
            cost_perplexity: costs.cost_perplexity,
            cost_gemini:     costs.cost_gemini,
            cost_youtube:    costs.cost_youtube,
            cost_total:      costs.cost_total,
            models_used:     costs.models_used,
            article_count:   articleCount,
            duration_s,
          }).select('id').single();
          reportId = logRow?.id ?? null;
        } catch (e) {
          cb(`Warning: could not save report log — ${(e as Error).message}`, 'warn');
        }

        // Encode HTML as base64 and send done event
        const htmlB64 = Buffer.from(html, 'utf8').toString('base64');
        send('done', JSON.stringify({ htmlB64, reportId }));
      } catch (e) {
        const msg = (e as Error).message || 'Pipeline failed';
        try {
          send('error', JSON.stringify({ msg }));
        } catch {}
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
