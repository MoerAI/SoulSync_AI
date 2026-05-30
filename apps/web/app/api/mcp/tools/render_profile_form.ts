import { ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const profileFormResourceUri = "ui://widget/profile-form.html";

export async function renderProfileForm(): Promise<ToolResponse> {
  requireScope(currentClaims(), "profile.read");

  return ok({ resourceUri: profileFormResourceUri }, "Profile form ready.", { resourceUri: profileFormResourceUri });
}
