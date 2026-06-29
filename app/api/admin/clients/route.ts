import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

export async function GET() {
  let admin;
  try { admin = await requireAdmin(); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const { data: profiles, error } = await svc.from('profiles').select('id, email, role, created_at').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach last run date per user
  const { data: runs } = await svc.from('report_logs').select('user_id, created_at').order('created_at', { ascending: false });
  const lastRun: Record<string, string> = {};
  (runs || []).forEach((r: { user_id: string; created_at: string }) => { if (!lastRun[r.user_id]) lastRun[r.user_id] = r.created_at; });

  const clients = (profiles || []).map((p: { id: string; email: string; role: string; created_at: string }) => ({ ...p, last_run: lastRun[p.id] || null }));
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { email, password } = await request.json();
  if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Create profile row
  await svc.from('profiles').insert({ id: data.user!.id, email, role: 'client' });

  return NextResponse.json({ success: true, userId: data.user!.id });
}

export async function DELETE(request: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const svc = createServiceClient();
  await svc.from('profiles').delete().eq('id', userId);
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
