import { serializeMatchJob } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, stringValue, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const getMatchJobInput = {
  jobId: z.string().min(1),
};

type MatchJobRow = {
  id: string;
  app_user_id: string;
  status: string;
  progress?: number | null;
};

export async function getMatchJob(input: { jobId: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.read");
  const actor = actorFor(claims);
  const { data, error } = await getServiceSupabase().from("match_jobs").select("id, app_user_id, status, progress").eq("id", input.jobId).eq("app_user_id", actor.appUserId).single<MatchJobRow>();

  if (error || !data) {
    rowError(`Unable to load match job ${input.jobId}`);
  }

  const status = stringValue(data.status) ?? "unknown";

  return ok(serializeMatchJob({ jobId: data.id, status, progress: data.progress ?? 0 }), `Match job is ${status}.`, {
    job: { id: data.id, status, progress: data.progress ?? 0 },
  });
}
