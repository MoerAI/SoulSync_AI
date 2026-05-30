import { ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const recommendationsResourceUri = "ui://widget/recommendations.html";

export async function renderRecommendations(): Promise<ToolResponse> {
  requireScope(currentClaims(), "profile.read");

  return ok({ resourceUri: recommendationsResourceUri }, "Recommendations widget ready.", { resourceUri: recommendationsResourceUri });
}
