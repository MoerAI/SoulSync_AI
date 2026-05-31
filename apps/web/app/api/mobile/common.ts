import { actorFromSupabaseJwt, OAuthAccessTokenError, type McpActor } from "@soulsync/core/src/identity/index";
import { findAppUserBySupabaseUserId } from "@soulsync/core/src/services/identityService";

import { getServiceSupabase } from "../../../lib/supabase";
import type { ServiceClient } from "./services";

export const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export const withMobileActor = async (request: Request, handler: (actor: McpActor) => Promise<Response>): Promise<Response> => {
  try {
    return await handler(await actorFromSupabaseJwt(request, supabaseJwtIdentityClient()));
  } catch (error) {
    if (error instanceof OAuthAccessTokenError) {
      return jsonResponse({ error: error.code, error_description: error.message }, error.status);
    }

    return jsonResponse({ error: "server_error", error_description: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
};

export const serviceClient = (): ServiceClient => getServiceSupabase() as ServiceClient;

const supabaseJwtIdentityClient = () => ({
  findAppUserBySupabaseUserId: (supabaseUserId: string) => findAppUserBySupabaseUserId(serviceClient(), supabaseUserId),
});

export const readJson = async (request: Request): Promise<Record<string, unknown>> => {
  if (!request.body) {
    return {};
  }

  const value = await request.json().catch(() => ({}));

  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

export const stringField = (body: Record<string, unknown>, key: string): string => {
  const value = body[key];

  return typeof value === "string" ? value : "";
};

export const recordField = (body: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = body[key];

  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};
