import { afterEach, describe, expect, test, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/photo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("returns 400 when src is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");

    const response = await GET(new Request("https://demo.example/api/photo"));

    expect(response.status).toBe(400);
  });

  test("returns 400 when src does not start with SUPABASE_URL", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");

    const response = await GET(new Request("https://demo.example/api/photo?src=https%3A%2F%2Fevil.com%2Fx.jpg"));

    expect(response.status).toBe(400);
  });

  test("returns proxied image bytes from a SUPABASE_URL src", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    const src = "http://127.0.0.1:54321/storage/v1/object/sign/profile-private/photo.jpg?token=signed-token";
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request(`https://demo.example/api/photo?src=${encodeURIComponent(src)}`));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(src);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=600");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
  });
});
