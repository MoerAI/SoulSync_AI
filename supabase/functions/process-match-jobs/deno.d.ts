declare module "npm:@supabase/supabase-js@2" {
  export function createClient(url: string, key: string, options?: { auth?: { persistSession?: boolean; autoRefreshToken?: boolean } }): unknown;
}
