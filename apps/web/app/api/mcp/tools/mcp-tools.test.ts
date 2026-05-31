import { describe, expect, test, vi } from "vitest";

import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import { startMatchJobTool } from "./start_match_job";
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
