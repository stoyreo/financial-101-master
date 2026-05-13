import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email  = (searchParams.get('email')  || '').trim().toLowerCase();
  const secret = searchParams.get('secret') || '';

  const expectedSecret = process.env.FINANCIAL_101_LINK_SECRET || '';
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('app_users')
      .select('storage_key, username, email')
      .eq('email', email)
      .single();

    if (error || !data?.storage_key) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }
    return NextResponse.json(
      { storage_key: data.storage_key, username: data.username, email: data.email },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[/api/resolve-user] error:', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
