import { jsonResponse, serviceClient, withMobileActor } from "../common";
import { listMobileRecommendations } from "../services";

export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> =>
  withMobileActor(request, async (actor) => {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") ?? 3)));

    return jsonResponse(await listMobileRecommendations(actor, { jobId: url.searchParams.get("jobId") ?? undefined, limit }, serviceClient()));
  });
