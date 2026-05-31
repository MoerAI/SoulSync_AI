import { exchangeAuthorizationCode, oauthError, oauthJson, readRequestBody } from "../lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readRequestBody(request);
    const stringBody = Object.fromEntries(Object.entries(body).filter((entry): entry is [string, string] => typeof entry[1] === "string"));

    return oauthJson(await exchangeAuthorizationCode(stringBody));
  } catch (error) {
    return oauthError(error);
  }
}
