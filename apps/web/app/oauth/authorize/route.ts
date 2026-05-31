import { createAuthorizationCode, oauthError } from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const { code, state } = await createAuthorizationCode(request);
    const location = new URL(code.redirectUri);
    location.searchParams.set("code", code.code);
    if (state) {
      location.searchParams.set("state", state);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: location.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return oauthError(error);
  }
}
