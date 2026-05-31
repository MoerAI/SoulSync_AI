import { getMatchJob as getMatchJobService } from "@soulsync/core/src/services/matchService";
import { serializeMatchJob } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const getMatchJobInput = {
  jobId: z.string().min(1),
};

export async function getMatchJob(input: { jobId: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.read");
  const actor = actorFor(claims);
  const job = await getMatchJobService(input, { client: getServiceSupabase(), actor }).catch(() => null);
  if (!job) {
    rowError(`Unable to load match job ${input.jobId}`);
  }

  return ok(serializeMatchJob(job), `Match job is ${job.rawStatus}.`, {
    job: { id: job.jobId, status: job.rawStatus, progress: job.rawProgress },
  });
}
