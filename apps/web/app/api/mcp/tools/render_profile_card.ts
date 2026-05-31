import { ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const profileCardResourceUri = "ui://widget/profile-card.html";

export async function renderProfileCard(): Promise<ToolResponse> {
  requireScope(currentClaims(), "profile.read");

  return ok({ resourceUri: profileCardResourceUri }, "Profile card widget ready.", { resourceUri: profileCardResourceUri });
}
