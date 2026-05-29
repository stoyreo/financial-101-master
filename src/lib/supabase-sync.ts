import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

let _syncTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 2000;

export function syncToSupabase(
  userId: string,
  storeData: Record<string, any>
): void {
  if (!userId) return;

  if (_syncTimer) clearTimeout(_syncTimer);

  _syncTimer = setTimeout(async () => {
    try {
      const { error } = await supabase
        .from('user_financial_data')
        .upsert(
          {
            user_id: userId,
            data: storeData,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('[supabase-sync] upsert error:', error.message);
      }
    } catch (err) {
      console.error('[supabase-sync] unexpected error:', err);
    }
  }, DEBOUNCE_MS);
}

export async function loadFromSupabase(
  userId: string
): Promise<Record<string, any> | null> {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('user_financial_data')
      .select('data, updated_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[supabase-sync] load error:', error.message);
      return null;
    }

    return data
      ? { ...data.data, _supabaseUpdatedAt: data.updated_at }
      : null;
  } catch (err) {
    console.error('[supabase-sync] unexpected load error:', err);
    return null;
  }
}

export async function deleteFromSupabase(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await supabase
      .from('user_financial_data')
      .delete()
      .eq('user_id', userId);
  } catch (err) {
    console.error('[supabase-sync] delete error:', err);
  }
}
