import type { SupabaseClient } from "@supabase/supabase-js";

import type { StoredAppUser } from "../identity";

type AppUserRow = { id: string; primary_email: string | null; display_name: string | null };

export const findAppUserBySupabaseUserId = async (client: SupabaseClient, supabaseUserId: string): Promise<StoredAppUser | null> => {
  const { data } = await client.from("app_users").select("id, primary_email, display_name").eq("supabase_user_id", supabaseUserId).maybeSingle<AppUserRow>();

  return data ? { id: data.id, primaryEmail: data.primary_email, displayName: data.display_name } : null;
};
