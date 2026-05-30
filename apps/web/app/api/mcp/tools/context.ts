import { AsyncLocalStorage } from "node:async_hooks";

import type { OAuthAccessTokenClaims } from "@soulsync/core/src/identity/index";

const claimsStore = new AsyncLocalStorage<OAuthAccessTokenClaims>();

export function runWithClaims<T>(claims: OAuthAccessTokenClaims, callback: () => T): T {
  return claimsStore.run(claims, callback);
}

export function currentClaims(): OAuthAccessTokenClaims {
  const claims = claimsStore.getStore();

  if (!claims) {
    throw new Error("MCP tool called without OAuth claims");
  }

  return claims;
}
