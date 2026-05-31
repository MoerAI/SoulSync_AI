import { jsonResponse, readJson, recordField, serviceClient, withMobileActor } from "../../common";
import { updateMobilePersona } from "../../services";
import type { PersonaTalkingPoints } from "@soulsync/core/src/persona/index";
import type { PersonaSpec } from "@soulsync/core/src/types/index";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const body = await readJson(request);

    return jsonResponse(await updateMobilePersona(actor, { updates: recordField(body, "updates") as Partial<PersonaSpec> & Partial<PersonaTalkingPoints> }, serviceClient()));
  });
