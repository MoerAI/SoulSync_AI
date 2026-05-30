import { jsonResponse, readJson, serviceClient, stringField, withMobileActor } from "../common";
import { reportMobileProfile } from "../services";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const body = await readJson(request);

    return jsonResponse(await reportMobileProfile(actor, { profileId: stringField(body, "profileId"), reason: stringField(body, "reason") }, serviceClient() as never));
  });
