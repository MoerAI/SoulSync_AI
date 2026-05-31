import { jsonResponse, serviceClient, withMobileActor } from "../common";
import { deleteMobileAccount } from "../services";

export const dynamic = "force-dynamic";

export const DELETE = (request: Request): Promise<Response> => withMobileActor(request, async (actor) => jsonResponse(await deleteMobileAccount(actor, serviceClient())));
