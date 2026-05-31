import { afterEach, describe, expect, test, vi } from "vitest";

import type { McpActor } from "@soulsync/core/src/identity/index";
import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import { startMatchJobTool } from "./start_match_job";
import { startProfileCardJobTool } from "./start_profile_card_job";
import { toRecommendationResponse } from "./list_recommendations";

const unusedClient: SupabaseLike = {
  from() {
    throw new Error("unused test client");
  },
  rpc() {
    throw new Error("unused test client");
  },
};

describe("MCP tool adapters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("start_match_job enqueues and returns a queued job without running the pipeline", async () => {
    const startMatchJob = vi.fn().mockResolvedValue({ jobId: "job-123", status: "queued" });
    const response = await startMatchJobTool(
      { source: "mcp", id: "user-123", appUserId: "user-123", scopes: ["match.run"] },
      unusedClient,
      { startMatchJob },
    );

    expect(startMatchJob).toHaveBeenCalledOnce();
    expect(response.structuredContent).toEqual({ jobId: "job-123", status: "queued" });
  });

  test("start_match_job runs the job synchronously when DEMO_INSTANT_MATCH is enabled", async () => {
    vi.stubEnv("DEMO_INSTANT_MATCH", "1");
    const startMatchJob = vi.fn().mockResolvedValue({ jobId: "job-123", status: "queued" });
    const runMatchJobInstant = vi.fn().mockResolvedValue({ jobId: "job-123", status: "succeeded", recommendations: [], fallbackTrace: [], candidateStatuses: [] });

    const response = await startMatchJobTool(
      { source: "mcp", id: "user-123", appUserId: "user-123", scopes: ["match.run"] },
      unusedClient,
      { startMatchJob, runMatchJobInstant },
    );

    expect(startMatchJob).toHaveBeenCalledOnce();
    expect(runMatchJobInstant).toHaveBeenCalledWith("job-123", unusedClient);
    expect(response.structuredContent).toEqual({ jobId: "job-123", status: "queued" });
  });

  test("start_match_job only enqueues when DEMO_INSTANT_MATCH is unset", async () => {
    const startMatchJob = vi.fn().mockResolvedValue({ jobId: "job-123", status: "queued" });
    const runMatchJobInstant = vi.fn().mockResolvedValue({ jobId: "job-123", status: "succeeded", recommendations: [], fallbackTrace: [], candidateStatuses: [] });

    await startMatchJobTool(
      { source: "mcp", id: "user-123", appUserId: "user-123", scopes: ["match.run"] },
      unusedClient,
      { startMatchJob, runMatchJobInstant },
    );

    expect(startMatchJob).toHaveBeenCalledOnce();
    expect(runMatchJobInstant).not.toHaveBeenCalled();
  });

  test("start_match_job keeps the enqueue response if the instant demo run fails", async () => {
    vi.stubEnv("DEMO_INSTANT_MATCH", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const startMatchJob = vi.fn().mockResolvedValue({ jobId: "job-123", status: "queued" });
    const runMatchJobInstant = vi.fn().mockRejectedValue(new Error("demo run failed"));

    const response = await startMatchJobTool(
      { source: "mcp", id: "user-123", appUserId: "user-123", scopes: ["match.run"] },
      unusedClient,
      { startMatchJob, runMatchJobInstant },
    );

    expect(response.structuredContent).toEqual({ jobId: "job-123", status: "queued" });
    expect(warn).toHaveBeenCalledWith("DEMO_INSTANT_MATCH run failed", expect.any(Error));
  });

  test("start_profile_card_job returns whether profile card generation was enqueued", async () => {
    const actor: McpActor = { source: "mcp", id: "user-123", appUserId: "user-123", scopes: ["profile.write"] };
    const enqueueProfileCardGeneration = vi.fn().mockResolvedValue({ enqueued: true, jobId: "profile-card-job-123" });
    const response = await startProfileCardJobTool(actor, unusedClient, { enqueueProfileCardGeneration });

    expect(enqueueProfileCardGeneration).toHaveBeenCalledWith("user-123", expect.objectContaining({ actor }));
    expect(response.structuredContent).toEqual({ enqueued: true });
    expect(response.content).toEqual([{ type: "text", text: "Profile card generation queued." }]);
    expect(response._meta).toEqual({});
  });

  test("list_recommendations structuredContent omits sensitive candidate details", () => {
    const response = toRecommendationResponse([
      {
        id: "rec-1",
        job_id: "job-1",
        candidate_id: "candidate-1",
        rank: 1,
        overall: 91,
        summary_ko: "대화 흐름이 좋습니다.",
        is_synthetic: true,
        subscores: { raw_transcript: "secret transcript", salary: "1억", exact_district: "강남구" },
      },
    ]);

    expect(response.structuredContent).toEqual({ count: 1, recommendations: [{ id: "rec-1", rank: 1, overall: 91, summaryKo: "대화 흐름이 좋습니다.", is_synthetic: true }] });
    expect(JSON.stringify(response.structuredContent)).not.toMatch(/salary|district|transcript|secret/i);
    expect(response._meta).toEqual({
      recommendations: [
        {
          id: "rec-1",
          candidateId: "candidate-1",
          rank: 1,
          subscores: {},
          highlights: [],
        },
      ],
    });
  });
});
