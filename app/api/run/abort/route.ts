import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const svc = createServiceClient();
  // -999 is the abort signal — pipeline checks for this and throws PIPELINE_ABORTED
  await svc.from('run_approvals').update({ approved_step: -999 }).eq('run_id', body.runId);
  return NextResponse.json({ ok: true });
}
