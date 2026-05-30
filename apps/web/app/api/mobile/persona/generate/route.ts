import { jsonResponse, readJson, serviceClient, withMobileActor } from "../../common";
import { generateMobilePersona } from "../../services";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const body = await readJson(request);

    return jsonResponse(await generateMobilePersona(actor, { consent: body.consent as never }, serviceClient() as never));
  });
