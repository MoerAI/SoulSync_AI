import { oauthError, oauthJson, readRequestBody, registerOAuthClient } from "../lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readRequestBody(request);
    const client = registerOAuthClient(input);

    return oauthJson(
      {
        client_id: client.clientId,
        client_id_issued_at: client.issuedAt,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        client_name: client.clientName,
        scope: client.scope,
      },
      201,
    );
  } catch (error) {
    return oauthError(error);
  }
}
