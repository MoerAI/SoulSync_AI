import { jsonResponse, readJson, serviceClient, withMobileActor } from "../../common";
import { generateMobilePersona } from "../../services";
import type { PersonaConsent } from "@soulsync/core/src/persona/index";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const body = await readJson(request);

    const consent = body.consent;
    const personaConsent: PersonaConsent | undefined = typeof consent === "boolean" || (consent && typeof consent === "object" && !Array.isArray(consent)) ? (consent as PersonaConsent) : undefined;

    return jsonResponse(await generateMobilePersona(actor, { consent: personaConsent }, serviceClient()));
  });
