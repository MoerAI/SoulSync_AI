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

  test("proxies only _meta photo URLs when DEMO_PHOTO_PROXY is enabled", async () => {
    vi.stubEnv("DEMO_PHOTO_PROXY", "1");
    vi.stubEnv("APP_BASE_URL", "https://demo.example");
    const signedUrl = "http://127.0.0.1:54321/storage/v1/object/sign/profile-private/slot-1.jpg?token=signed-token&expires=1760000000";
    serviceMock.getProfileCardForViewerEnsured.mockResolvedValue({
      card: { version: "card-v1", is_synthetic: false },
      photos: { "slot-1": signedUrl },
    });

    const response = await runWithClaims(claims(), () => getProfileCard({}));

    expect(response.structuredContent).toEqual({ hasCard: true, is_synthetic: false });
    expect(response._meta).toEqual({
      card: { version: "card-v1", is_synthetic: false },
      photos: { "slot-1": `https://demo.example/api/photo?src=${encodeURIComponent(signedUrl)}` },
    });
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
