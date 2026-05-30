import { jsonResponse, serviceClient, withMobileActor } from "../common";
import { enqueueMobileMatchJob } from "../services";

export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> => withMobileActor(request, async (actor) => jsonResponse(await enqueueMobileMatchJob(actor, serviceClient() as never)));
