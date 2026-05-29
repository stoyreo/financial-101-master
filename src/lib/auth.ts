import { createClient } from "@/lib/supabase/server";

export interface AppUser {
  id: string;
  email: string;
  role: string;
  supabase_user_id: string;
  created_at: string;
}

export async function ensureAppUserFromSupabase(
  email: string,
  supabaseUserId: string
): Promise<AppUser> {
  const supabase = createClient();

  const { data: existing, error: findError } = await supabase
    .from("app_users")
    .select("*")
    .eq("supabase_user_id", supabaseUserId)
    .single();

  if (existing && !findError) {
    return existing as AppUser;
  }

  const { data: created, error: createError } = await supabase
    .from("app_users")
    .insert({
      email,
      supabase_user_id: supabaseUserId,
      role: "user",
    })
    .select()
    .single();

  if (createError || !created) {
    throw new Error(
      `ensureAppUserFromSupabase failed: ${createError?.message ?? "no row returned"}`
    );
  }

  return created as AppUser;
}
