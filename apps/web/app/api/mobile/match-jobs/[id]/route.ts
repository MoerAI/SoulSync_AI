import { jsonResponse, serviceClient, withMobileActor } from "../../common";
import { getMobileMatchJob } from "../../services";

export const dynamic = "force-dynamic";

export const GET = (request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> =>
  withMobileActor(request, async (actor) => jsonResponse(await getMobileMatchJob(actor, (await context.params).id, serviceClient() as never)));
