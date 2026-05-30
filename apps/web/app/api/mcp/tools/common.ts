import { actorFromClaims, OAuthAccessTokenError, type McpActor, type OAuthAccessTokenClaims } from "@soulsync/core/src/identity/index";

export type ToolResponse = {
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: "text"; text: string }>;
  _meta?: Record<string, unknown>;
};

export function actorFor(claims: OAuthAccessTokenClaims): McpActor {
  return actorFromClaims(claims);
}

export function requireScope(claims: OAuthAccessTokenClaims, scope: "profile.read" | "profile.write" | "match.run"): void {
  if (!claims.scopes.includes(scope)) {
    throw new OAuthAccessTokenError("insufficient_scope", `Missing required OAuth scope: ${scope}`);
  }
}

export function ok(structuredContent: Record<string, unknown>, text: string, meta?: Record<string, unknown>): ToolResponse {
  return {
    structuredContent,
    content: [{ type: "text", text }],
    ...(meta ? { _meta: meta } : {}),
  };
}

export function rowError(message: string): never {
  throw new Error(message);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function boolValue(value: unknown): boolean {
  return value === true;
}
