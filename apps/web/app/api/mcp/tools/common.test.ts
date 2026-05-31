import { afterEach, describe, expect, test, vi } from "vitest";

import { proxyPhotoUrl } from "./common";

describe("proxyPhotoUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns signed photo URLs unchanged when DEMO_PHOTO_PROXY is unset", () => {
    vi.stubEnv("APP_BASE_URL", "https://demo.example");
    const signedUrl = "http://127.0.0.1:54321/storage/v1/object/sign/profile-private/photo.jpg?token=signed-token&expires=1760000000";

    expect(proxyPhotoUrl(signedUrl)).toBe(signedUrl);
  });

  test("wraps and encodes signed photo URLs when DEMO_PHOTO_PROXY is enabled", () => {
    vi.stubEnv("DEMO_PHOTO_PROXY", "1");
    vi.stubEnv("APP_BASE_URL", "https://demo.example");
    const signedUrl = "http://127.0.0.1:54321/storage/v1/object/sign/profile-private/photo one.jpg?token=signed-token&expires=1760000000";

    expect(proxyPhotoUrl(signedUrl)).toBe(`https://demo.example/api/photo?src=${encodeURIComponent(signedUrl)}`);
  });
});
