import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { callTool, notifyIntrinsicHeight, setWidgetState, type ToolResult } from "../bridge";
import { Badge, Button, Card, EmptyState, ErrorState, ProgressBar } from "../components";
import { GlobalStyles } from "../theme";
import { RecommendationsWidget } from "../recommendations";
import "./styles.css";

type MatchJobStatus = "queued" | "running" | "succeeded" | "failed";

type MatchJob = {
  id?: string;
  status: MatchJobStatus;
  progress: number;
  message?: string;
  result?: ToolResult | unknown;
};

type MatchStatusWidgetProps = {
  initialJobId?: string;
  pollIntervalMs?: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberFrom(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeStatus(value: unknown): MatchJobStatus {
  if (value === "queued" || value === "running" || value === "succeeded" || value === "failed") {
    return value;
  }
  return "queued";
}

function normalizeJob(result: unknown, fallback?: MatchJob): MatchJob {
  const wrapper = asRecord(result);
  const content = asRecord(wrapper?.structuredContent) ?? asRecord(result) ?? {};
  const rawJob = asRecord(content.job) ?? content;
  const status = normalizeStatus(rawJob.status ?? fallback?.status);
  const defaultProgress = status === "queued" ? 8 : status === "running" ? 48 : status === "succeeded" ? 100 : fallback?.progress ?? 0;
  return {
    id: stringFrom(rawJob.id ?? rawJob.jobId ?? fallback?.id),
    status,
    progress: Math.max(0, Math.min(100, Math.round(numberFrom(rawJob.progress ?? rawJob.progressPercent, defaultProgress)))),
    message: stringFrom(rawJob.message ?? rawJob.error ?? fallback?.message),
    result: rawJob.result ?? content.result ?? (status === "succeeded" ? result : fallback?.result)
  };
}

function statusCopy(job: MatchJob) {
  if (job.status === "queued") {
    return { badge: "대기 중", title: "매칭 작업을 대기열에 올렸어요", description: job.message ?? "곧 대화 시뮬레이션과 심사를 시작합니다." };
  }
  if (job.status === "running") {
    return { badge: "진행 중", title: "후보 대화를 심사 중이에요", description: job.message ?? "대화 흐름, 호기심, 가치관 신호를 순서대로 계산하고 있어요." };
  }
  if (job.status === "succeeded") {
    return { badge: "완료", title: "추천 결과가 준비됐어요", description: job.message ?? "공개 가능한 정보와 위젯 전용 사진 URL로 결과를 확인할 수 있습니다." };
  }
  return { badge: "실패", title: "매칭 작업이 멈췄어요", description: job.message ?? "일시적인 문제일 수 있어 재시도로 새 작업을 시작할 수 있어요." };
}

export function MatchStatusWidget({ initialJobId, pollIntervalMs = 800 }: MatchStatusWidgetProps) {
  const [job, setJob] = useState<MatchJob>({ id: initialJobId, status: "queued", progress: 8 });
  const [error, setError] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const copy = useMemo(() => statusCopy(job), [job]);

  async function pollJob(currentJob = job) {
    setError(undefined);
    if (!currentJob.id) {
      await retryJob();
      return;
    }
    try {
      const result = await callTool("get_match_job", { jobId: currentJob.id });
      setJob((previous) => normalizeJob(result, previous));
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "매칭 작업 상태를 확인하지 못했어요.");
    }
  }

  async function retryJob() {
    setRetrying(true);
    setError(undefined);
    try {
      const result = await callTool("start_match_job", {});
      const nextJob = normalizeJob(result, { status: "queued", progress: 8 });
      setJob(nextJob);
      setShowRecommendations(false);
      await pollJob(nextJob);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "재시도 작업을 시작하지 못했어요.");
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    void pollJob();
  }, []);

  useEffect(() => {
    if (job.status !== "queued" && job.status !== "running") {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void pollJob();
    }, pollIntervalMs);
    return () => window.clearTimeout(timer);
  }, [job.id, job.status, job.progress, pollIntervalMs]);

  useEffect(() => {
    setWidgetState({ widget: "match-status", jobId: job.id, status: job.status, progress: job.progress });
    notifyIntrinsicHeight(document.documentElement.scrollHeight);
  }, [job, error, showRecommendations]);

  if (showRecommendations) {
    return <RecommendationsWidget initialResult={job.result} />;
  }

  return (
    <div className="ssw-scope ssw-status-shell" data-widget="match-status">
      <GlobalStyles />
      <div className="ssw-status-orb" />
      <Card className="ssw-status-card" padding="lg">
        <div className="ssw-status-card__header">
          <Badge text={copy.badge} variant={job.status === "failed" ? "error" : job.status === "succeeded" ? "success" : "default"} />
          <span>{job.id ? `Job ${job.id}` : "새 작업"}</span>
        </div>
        <div className="ssw-status-copy">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <div className="ssw-status-lifecycle" aria-label="매칭 작업 단계">
          {(["queued", "running", "succeeded"] as const).map((step) => (
            <div className={job.status === step ? "ssw-status-step ssw-status-step--active" : "ssw-status-step"} key={step}>
              <span />
              <strong>{step === "queued" ? "queued" : step === "running" ? "running" : "succeeded"}</strong>
            </div>
          ))}
        </div>
        {job.status === "failed" ? (
          <ErrorState description={copy.description} onRetry={retryJob} retryLabel="재시도" title="작업 실패" />
        ) : (
          <ProgressBar label={job.status === "succeeded" ? "매칭 완료" : "매칭 진행률"} value={job.progress} />
        )}
        {error ? <p className="ssw-status-alert" role="alert">{error}</p> : null}
        <div className="ssw-status-actions">
          {job.status === "failed" ? (
            <Button loading={retrying} onClick={retryJob} size="lg">
              재시도
            </Button>
          ) : null}
          {job.status === "succeeded" ? (
            <Button onClick={() => setShowRecommendations(true)} size="lg" variant="secondary">
              결과 보기
            </Button>
          ) : null}
        </div>
      </Card>
      {job.status === "queued" ? <EmptyState description="대기열 상태는 자동으로 갱신됩니다. 이 창을 닫아도 서버 작업은 계속됩니다." title="작업 대기 중" /> : null}
    </div>
  );
}

export function mountMatchStatus(element: Element, initialJobId?: string) {
  return createRoot(element).render(<MatchStatusWidget initialJobId={initialJobId} />);
}

if (typeof document !== "undefined") {
  const mount = document.querySelector("[data-soulsync-match-status]");
  if (mount) {
    mountMatchStatus(mount, mount.getAttribute("data-job-id") ?? undefined);
  }
}
