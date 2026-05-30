import { jsonResponse, readJson, recordField, serviceClient, withMobileActor } from "../../common";
import { updateMobilePersona } from "../../services";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const body = await readJson(request);

    return jsonResponse(await updateMobilePersona(actor, { updates: recordField(body, "updates") as never }, serviceClient() as never));
  });
