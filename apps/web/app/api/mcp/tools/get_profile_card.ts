import { z } from "zod";

import { getProfileCardForViewerEnsured } from "@soulsync/core/src/services/profileCardService";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const getProfileCardInput = { candidateId: z.string().optional() };

export async function getProfileCard(input: { candidateId?: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.read");
  const actor = actorFor(claims);
  const { card, photos } = await getProfileCardForViewerEnsured(input ?? {}, { client: getServiceSupabase(), actor }, { generate: process.env.DEMO_INSTANT_CARD === "1" });

  return ok(
    { hasCard: Boolean(card), is_synthetic: Boolean(card?.is_synthetic) },
    card ? "Profile card ready." : "No profile card available yet.",
    { card, photos },
  );
}
