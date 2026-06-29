import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RunRow = {
  id: number;
  user_id: string;
  organizations: string[];
  article_count: number;
  duration_s: number;
  cost_claude: number;
  cost_openai: number;
  cost_perplexity: number;
  cost_gemini: number;
  cost_youtube: number;
  cost_apidirect: number;
  cost_total: number;
  models_used: Record<string, number> | null;
  created_at: string;
};

type ProfileRow = { id: string; email: string };

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single();
  return (profile as { role: string } | null)?.role === 'admin' ? user : null;
}

export async function GET() {
  let admin;
  try { admin = await requireAdmin(); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();

  const { data: rawRuns, error } = await svc
    .from('report_logs')
    .select('id, user_id, organizations, article_count, duration_s, cost_claude, cost_openai, cost_perplexity, cost_gemini, cost_youtube, cost_apidirect, cost_total, models_used, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const runs = (rawRuns || []) as RunRow[];
  const totalRuns = runs.length;
  const totalCost = runs.reduce((s: number, r: RunRow) => s + (r.cost_total || 0), 0);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const thisMonth  = runs.filter((r: RunRow) => new Date(r.created_at) >= monthStart);

  const sum = (field: keyof RunRow) => thisMonth.reduce((s: number, r: RunRow) => s + ((r[field] as number) || 0), 0);
  const monthCost = {
    claude:     sum('cost_claude'),
    openai:     sum('cost_openai'),
    perplexity: sum('cost_perplexity'),
    gemini:     sum('cost_gemini'),
    youtube:    sum('cost_youtube'),
    apidirect:  sum('cost_apidirect'),
    total:      sum('cost_total'),
  };

  const { data: rawProfiles } = await svc.from('profiles').select('id, email');
  const profiles = (rawProfiles || []) as ProfileRow[];
  const emailMap: Record<string, string> = {};
  profiles.forEach((p: ProfileRow) => { emailMap[p.id] = p.email; });

  const runsWithEmail = runs.map((r: RunRow) => ({ ...r, user_email: emailMap[r.user_id] || r.user_id }));

  return NextResponse.json({ totalRuns, totalCost: +totalCost.toFixed(4), monthCost, runs: runsWithEmail });
}
