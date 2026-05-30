import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IdentityClient, StoredAppUser, StoredExternalIdentity } from "@soulsync/core/src/identity/index";

let client: SupabaseClient | undefined;

export function getServiceSupabase(): SupabaseClient {
  if (client) {
    return client;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for MCP tools");
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}

export function getSupabaseIdentityClient(): IdentityClient {
  const supabase = getServiceSupabase();

  return {
    async findExternalIdentity(input) {
      const { data } = await supabase.from("external_identities").select("id, app_user_id, provider, provider_subject, email, raw_claims").eq("provider", input.provider).eq("provider_subject", input.providerSubject).maybeSingle<ExternalIdentityRow>();

      return data ? externalIdentityFromRow(data) : null;
    },
    async findAppUserByEmail(email) {
      const { data } = await supabase.from("app_users").select("id, primary_email, display_name").eq("primary_email", email).maybeSingle<AppUserRow>();

      return data ? appUserFromRow(data) : null;
    },
    async createAppUser(input) {
      const { data, error } = await supabase.from("app_users").insert({ primary_email: input.primaryEmail ?? null, display_name: input.displayName ?? null }).select("id, primary_email, display_name").single<AppUserRow>();

      if (error || !data) {
        throw new Error("Unable to create app user");
      }

      return appUserFromRow(data);
    },
    async upsertExternalIdentity(input) {
      const { data, error } = await supabase
        .from("external_identities")
        .upsert(
          {
            app_user_id: input.appUserId,
            provider: input.provider,
            provider_subject: input.providerSubject,
            email: input.email ?? null,
            raw_claims: input.rawClaims,
          },
          { onConflict: "provider,provider_subject" },
        )
        .select("id, app_user_id, provider, provider_subject, email, raw_claims")
        .single<ExternalIdentityRow>();

      if (error || !data) {
        throw new Error("Unable to upsert external identity");
      }

      return externalIdentityFromRow(data);
    },
    async createPendingExternalIdentity(input) {
      const { data, error } = await supabase
        .from("external_identities")
        .insert({ provider: input.provider, provider_subject: input.providerSubject, email: input.email ?? null, raw_claims: input.rawClaims })
        .select("id, app_user_id, provider, provider_subject, email, raw_claims")
        .single<ExternalIdentityRow>();

      if (error || !data) {
        throw new Error("Unable to create pending external identity");
      }

      return externalIdentityFromRow(data);
    },
  };
}

type AppUserRow = {
  id: string;
  primary_email: string | null;
  display_name: string | null;
};

type ExternalIdentityRow = {
  id: string;
  app_user_id: string | null;
  provider: string;
  provider_subject: string;
  email: string | null;
  raw_claims: Record<string, unknown> | null;
};

function appUserFromRow(row: AppUserRow): StoredAppUser {
  return { id: row.id, primaryEmail: row.primary_email, displayName: row.display_name };
}

function externalIdentityFromRow(row: ExternalIdentityRow): StoredExternalIdentity {
  return { id: row.id, appUserId: row.app_user_id, provider: row.provider, providerSubject: row.provider_subject, email: row.email, rawClaims: row.raw_claims };
}
