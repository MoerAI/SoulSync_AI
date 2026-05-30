import { ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const matchStatusResourceUri = "ui://widget/match-status.html";

export async function renderMatchStatus(): Promise<ToolResponse> {
  requireScope(currentClaims(), "profile.read");

  return ok({ resourceUri: matchStatusResourceUri }, "Match status widget ready.", { resourceUri: matchStatusResourceUri });
}
