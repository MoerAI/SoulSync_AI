import { NextResponse } from "next/server";

import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import { getServiceSupabase } from "../../../../lib/supabase";
import { authenticateCron, processProfileCardJobs } from "./worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const client = getServiceSupabase() as unknown as SupabaseLike;
  const summary = await processProfileCardJobs({ client });

  return NextResponse.json({ ok: true, ...summary });
}
