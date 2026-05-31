import { MockFriendli, type FriendliLike, type MockFriendliResponse } from "../friendli";
import type { JudgeScore } from "../types";
import { runMatchJob, type MatchJobResult, type MatchPipelineDeps, type SupabaseLike } from "./pipeline";

export type RunMatchJobInstantDeps = Omit<Partial<MatchPipelineDeps>, "client" | "friendli">;

export function demoMatchFriendli(candidateCount = 3): FriendliLike {
  const responses: MockFriendliResponse[] = [];

  for (let candidate = 0; candidate < candidateCount; candidate += 1) {
    for (let turn = 0; turn < 6; turn += 1) {
      responses.push({ status: 200, body: turn % 2 === 0 ? "안녕하세요. 오늘의 관심사를 편하게 나누고 싶어요." : "반갑습니다. 서로의 가치관을 천천히 알아가면 좋겠어요." });
    }
    responses.push({ status: 200, body: judgeScore(92 - candidate * 7) });
  }

  return new MockFriendli(responses);
}

export async function runMatchJobInstant(jobId: string, client: SupabaseLike, deps: RunMatchJobInstantDeps = {}): Promise<MatchJobResult> {
  return runMatchJob(jobId, {
    ...deps,
    client,
    friendli: demoMatchFriendli(),
    now: deps.now ?? (() => new Date()),
  });
}

function judgeScore(overall: number): JudgeScore {
  const friction = 15 - (overall - 75);

  return {
    overall,
    subscores: { flow: 23, coherence: 18, mutual_curiosity: 18, values_alignment: 18, friction_risk: friction },
    confidence: 0.91,
    flags: ["balanced_exchange"],
    summaryKo: `${overall}점 추천: 대화 흐름과 가치관 신호가 안정적입니다.`,
    rationale: "Deterministic e2e judge fixture.",
    judgePromptVersion: "judge-rubric-2026-05-31",
    judgeSchemaVersion: "judge-score-v1",
  };
}
