import { jsonResponse, readJson, recordField, serviceClient, stringField, withMobileActor } from "../../common";
import { saveMobileProfileStep } from "../../services";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const body = await readJson(request);

    return jsonResponse(await saveMobileProfileStep(actor, { step: stringField(body, "step"), data: recordField(body, "data") }, serviceClient()));
  });
