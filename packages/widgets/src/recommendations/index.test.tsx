// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { normalizeRecommendations } from "./index";

afterEach(() => {
  Reflect.deleteProperty(window, "__SOULSYNC_APP_ORIGIN__");
});

describe("normalizeRecommendations", () => {
  it("accepts signed Supabase photo URLs", () => {
    const signedUrl = "https://storage.supabase.co/object/sign/profiles/candidate-1.jpg?token=signed-one&expires=1760000000";

    const snapshot = normalizeRecommendations(recommendationsResult([{ candidateId: "candidate-1", photoUrl: signedUrl }]));

    expect(snapshot.recommendations[0].photoSignedUrl).toBe(signedUrl);
  });

  it("accepts same-origin photo proxy URLs with a src param", () => {
    const proxyUrl = "/api/photo?src=http%3A%2F%2F127.0.0.1%3A54321%2Fstorage%2Fv1%2Fobject%2Fsign%2Fprofiles%2Fcandidate-1.jpg%3Ftoken%3Dsigned-one";

    const snapshot = normalizeRecommendations(recommendationsResult([{ candidateId: "candidate-1", photoUrl: proxyUrl }]));

    expect(snapshot.recommendations[0].photoSignedUrl).toBe(proxyUrl);
  });

  it("accepts app-origin absolute photo proxy URLs in the ChatGPT iframe", () => {
    const appOrigin = "https://soul-demo.example";
    Object.defineProperty(window, "__SOULSYNC_APP_ORIGIN__", { configurable: true, value: appOrigin });
    const proxyUrl = `${appOrigin}/api/photo?src=http%3A%2F%2F127.0.0.1%3A54321%2Fstorage%2Fv1%2Fobject%2Fsign%2Fprofiles%2Fcandidate-1.jpg%3Ftoken%3Dsigned-one`;

    const snapshot = normalizeRecommendations(recommendationsResult([{ candidateId: "candidate-1", photoUrl: proxyUrl }]));

    expect(snapshot.recommendations[0].photoSignedUrl).toBe(proxyUrl);
  });

  it("rejects arbitrary external non-signed photo URLs", () => {
    const snapshot = normalizeRecommendations(recommendationsResult([{ candidateId: "candidate-1", photoUrl: "http://evil.com/x.jpg" }]));

    expect(snapshot.recommendations[0].photoSignedUrl).toBeUndefined();
  });

  it("rejects external photo proxy lookalike URLs", () => {
    const snapshot = normalizeRecommendations(recommendationsResult([{ candidateId: "candidate-1", photoUrl: "https://evil.com/api/photo?src=signed" }]));

    expect(snapshot.recommendations[0].photoSignedUrl).toBeUndefined();
  });
});

function recommendationsResult(candidates: Array<{ candidateId: string; photoUrl: string }>) {
  return {
    structuredContent: {},
    _meta: {
      recommendations: candidates.map((candidate, index) => ({
        id: `rec-${index + 1}`,
        candidateId: candidate.candidateId,
        rank: index + 1,
        overall: 92,
        subscores: { flow: 23, coherence: 18, mutual_curiosity: 18, values_alignment: 19, friction_risk: 2 },
        summaryKo: "대화 리듬과 장기 가치관이 안정적으로 맞는 후보입니다.",
        displayName: "민서",
        photoUrl: candidate.photoUrl,
        recommended: true,
      })),
    },
  };
}
