import { jsonResponse, readJson, serviceClient, stringField, withMobileActor } from "../common";
import { blockMobileProfile } from "../services";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const body = await readJson(request);

    return jsonResponse(await blockMobileProfile(actor, { profileId: stringField(body, "profileId") }, serviceClient()));
  });
