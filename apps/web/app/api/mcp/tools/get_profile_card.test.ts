import { afterEach, describe, expect, test, vi } from "vitest";

const serviceMock = vi.hoisted(() => ({
  getProfileCardForViewerEnsured: vi.fn(),
}));

const serviceClient = { service: "supabase" };

vi.mock("@soulsync/core/src/services/profileCardService", () => ({
  getProfileCardForViewerEnsured: serviceMock.getProfileCardForViewerEnsured,
}));

vi.mock("../../../../lib/supabase", () => ({
  getServiceSupabase: () => serviceClient,
}));

import { getProfileCard } from "./get_profile_card";
import { runWithClaims } from "./context";

describe("get_profile_card MCP tool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    serviceMock.getProfileCardForViewerEnsured.mockReset();
  });

  test("leaves instant card generation off by default", async () => {
    serviceMock.getProfileCardForViewerEnsured.mockResolvedValue({ card: null, photos: {} });

    await runWithClaims(claims(), () => getProfileCard({}));

    expect(serviceMock.getProfileCardForViewerEnsured).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ client: serviceClient, actor: expect.objectContaining({ appUserId: "actor" }) }),
      { generate: false },
    );
  });

  test("enables instant card generation only when DEMO_INSTANT_CARD is 1", async () => {
    vi.stubEnv("DEMO_INSTANT_CARD", "1");
    serviceMock.getProfileCardForViewerEnsured.mockResolvedValue({ card: null, photos: {} });

    await runWithClaims(claims(), () => getProfileCard({ candidateId: "candidate" }));

    expect(serviceMock.getProfileCardForViewerEnsured).toHaveBeenCalledWith(
      { candidateId: "candidate" },
      expect.objectContaining({ client: serviceClient, actor: expect.objectContaining({ appUserId: "actor" }) }),
      { generate: true },
    );
  });
});

const claims = () => ({
  iss: "issuer",
  aud: "audience",
  exp: 1,
  sub: "subject",
  scopes: ["profile.read"],
  appUserId: "actor",
  raw: {},
});
