import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

const scopesSupported = ["profile.read", "profile.write", "match.run"];
const fallbackIssuer = "http://localhost:8787/oauth-stub";

const metadataHandler = protectedResourceHandler({
  authServerUrls: readListEnv("OAUTH_AUTHORIZATION_SERVERS") ?? [readEnv("OAUTH_ISSUER") ?? fallbackIssuer],
  resourceUrl: readEnv("OAUTH_AUDIENCE"),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const response = metadataHandler(request);
  const metadata = (await response.json()) as Record<string, unknown>;
  const headers = new Headers(response.headers);

  return new Response(
    JSON.stringify({
      ...metadata,
      scopes_supported: scopesSupported,
      bearer_methods_supported: ["header"],
    }),
    {
      status: response.status,
      headers,
    },
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

function readListEnv(key: string): string[] | undefined {
  const value = readEnv(key);

  if (!value) {
    return undefined;
  }

  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function readEnv(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

  return env?.[key];
}
