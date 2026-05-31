import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { callTool, handleToolResult, notifyIntrinsicHeight, setWidgetState, type ToolResult } from "../bridge";
import { Badge, Button, Card, EmptyState, ErrorState, ProgressBar, SyntheticBadge } from "../components";
import { GlobalStyles } from "../theme";
import "./styles.css";

type JudgeSubscores = {
  flow?: number;
  coherence?: number;
  mutual_curiosity?: number;
  values_alignment?: number;
  friction_risk?: number;
};

type RecommendationCard = {
  recommendationId: string;
  candidateId: string;
  rank: number;
  overall: number;
  subscores: Required<JudgeSubscores>;
  summaryKo: string;
  displayName: string;
  ageRange?: string;
  mbti?: string;
  photoSignedUrl?: string;
  highlights: string[];
  isSynthetic: boolean;
  recommended: boolean;
};

type RecommendationsSnapshot = {
  recommendations: RecommendationCard[];
  explanation?: string;
};

type RecommendationsWidgetProps = {
  initialResult?: ToolResult | unknown;
};

const SUBSCORE_LABELS: Array<[keyof Required<JudgeSubscores>, string, number]> = [
  ["flow", "대화 흐름", 25],
  ["coherence", "일관성", 20],
  ["mutual_curiosity", "상호 호기심", 20],
  ["values_alignment", "가치관", 20],
  ["friction_risk", "마찰 낮음", 15]
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function structuredContent(result: unknown): Record<string, unknown> | unknown[] | undefined {
  const record = asRecord(result);
  const content = record && "structuredContent" in record ? record.structuredContent : result;
  if (Array.isArray(content)) {
    return content;
  }
  return asRecord(content);
}

function metaContent(result: unknown): Record<string, unknown> {
  return asRecord(asRecord(result)?._meta) ?? {};
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberFrom(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function candidateIdFrom(item: Record<string, unknown>, meta: Record<string, unknown>, rank: number) {
  const candidate = asRecord(item.candidate);
  return stringFrom(item.candidateId) ?? stringFrom(meta.candidateId) ?? stringFrom(candidate?.id) ?? `candidate-${rank}`;
}

function metaForCandidate(meta: Record<string, unknown>, candidateId: string, index: number) {
  const byId = asRecord(meta.candidates)?.[candidateId] ?? asRecord(meta.candidateMeta)?.[candidateId] ?? asRecord(meta.photos)?.[candidateId];
  const byIndex = arrayFrom(meta.recommendations)[index] ?? arrayFrom(meta.candidates)[index];
  return asRecord(byId) ?? asRecord(byIndex) ?? {};
}

function isSignedPhotoUrl(value: unknown): value is string {
  const url = stringFrom(value);
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    return ["token", "expires", "expiry", "signature", "X-Amz-Signature"].some((key) => params.has(key));
  } catch {
    return false;
  }
}

function signedPhotoFrom(meta: Record<string, unknown>) {
  const photo = asRecord(meta.photo);
  const candidates = [meta.photoSignedUrl, meta.signedPhotoUrl, meta.photoUrl, meta.avatarSignedUrl, photo?.signedUrl, photo?.url];
  return candidates.find(isSignedPhotoUrl);
}

function highlightsFrom(meta: Record<string, unknown>) {
  const values = arrayFrom(meta.highlights ?? meta.conversationHighlights ?? meta.conversation_highlights);
  return values.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 3);
}

function subscoresFrom(item: Record<string, unknown>) {
  const judgeScore = asRecord(item.judgeScore) ?? item;
  const raw = asRecord(judgeScore.subscores) ?? {};
  return {
    flow: numberFrom(raw.flow, 0),
    coherence: numberFrom(raw.coherence, 0),
    mutual_curiosity: numberFrom(raw.mutual_curiosity, 0),
    values_alignment: numberFrom(raw.values_alignment, 0),
    friction_risk: numberFrom(raw.friction_risk, 0)
  };
}

export function normalizeRecommendations(result: unknown): RecommendationsSnapshot {
  const content = structuredContent(result);
  const meta = metaContent(result);
  const source = Array.isArray(content) ? content : arrayFrom(content?.recommendations ?? content?.candidates);
  const explanation = !Array.isArray(content) ? stringFrom(content?.explanation ?? content?.fallbackReason ?? meta.explanation) : stringFrom(meta.explanation);

  const recommendations: RecommendationCard[] = [];

  source.forEach((value, index) => {
      const item = asRecord(value);
      if (!item) {
        return;
      }
      const rank = Math.max(1, Math.trunc(numberFrom(item.rank, index + 1)));
      const candidate = asRecord(item.candidate) ?? {};
      const metaCandidate = metaForCandidate(meta, stringFrom(item.candidateId) ?? `candidate-${rank}`, index);
      const candidateId = candidateIdFrom(item, metaCandidate, rank);
      const judgeScore = asRecord(item.judgeScore) ?? item;
      const displayName = stringFrom(candidate.displayName) ?? stringFrom(candidate.name) ?? stringFrom(metaCandidate.displayName) ?? `추천 후보 ${rank}`;
      const isSynthetic = Boolean(item.is_synthetic ?? candidate.is_synthetic ?? metaCandidate.is_synthetic);
      const recommendation: RecommendationCard = {
        recommendationId: stringFrom(item.id) ?? `recommendation-${rank}`,
        candidateId,
        rank,
        overall: Math.round(numberFrom(judgeScore.overall, numberFrom(item.overall, 0))),
        subscores: subscoresFrom(item),
        summaryKo: stringFrom(judgeScore.summaryKo) ?? stringFrom(item.summaryKo) ?? "대화 흐름과 가치관 신호를 기반으로 추천된 후보입니다.",
        displayName,
        ageRange: stringFrom(candidate.ageRange ?? metaCandidate.ageRange),
        mbti: stringFrom(candidate.mbti ?? metaCandidate.mbti),
        photoSignedUrl: signedPhotoFrom(metaCandidate),
        highlights: highlightsFrom(metaCandidate),
        isSynthetic,
        recommended: item.recommended !== false
      };
      if (recommendation.recommended) {
        recommendations.push(recommendation);
      }
    });

  recommendations.sort((left, right) => left.rank - right.rank);

  return { recommendations, explanation };
}

function RecommendationPhoto({ recommendation }: { recommendation: RecommendationCard }) {
  if (!recommendation.photoSignedUrl) {
    return <div aria-label="서명된 사진 없음" className="ssw-rec-photo ssw-rec-photo--fallback">SS</div>;
  }

  return <img alt={`${recommendation.displayName} 프로필 사진`} className="ssw-rec-photo" src={recommendation.photoSignedUrl} />;
}

function SubscoreBars({ recommendation }: { recommendation: RecommendationCard }) {
  return (
    <div className="ssw-rec-scores" aria-label={`${recommendation.displayName} 세부 점수`}>
      {SUBSCORE_LABELS.map(([key, label, max]) => {
        const rawValue = key === "friction_risk" ? max - recommendation.subscores[key] : recommendation.subscores[key];
        const percent = Math.round((Math.max(0, Math.min(max, rawValue)) / max) * 100);
        return (
          <div className="ssw-rec-score" key={key}>
            <span>{label}</span>
            <div className="ssw-rec-score__track" aria-hidden="true">
              <div className="ssw-rec-score__bar" style={{ transform: `scaleX(${percent / 100})` }} />
            </div>
            <strong>{percent}</strong>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationCardView({ recommendation }: { recommendation: RecommendationCard }) {
  const [savingAction, setSavingAction] = useState<string>();

  async function runAction(action: "save" | "report" | "block") {
    setSavingAction(action);
    try {
      if (action === "save") {
        await callTool("save_recommendation", { recommendationId: recommendation.recommendationId });
        return;
      }
      if (action === "report") {
        await callTool("report_profile", { candidateId: recommendation.candidateId, reason: "widget_report" });
        return;
      }
      await callTool("block_profile", { candidateId: recommendation.candidateId });
    } finally {
      setSavingAction(undefined);
    }
  }

  return (
    <Card className="ssw-rec-card" padding="md">
      <div className="ssw-rec-card__grid">
        <RecommendationPhoto recommendation={recommendation} />
        <div className="ssw-rec-card__content">
          <div className="ssw-rec-card__topline">
            <Badge text={`#${recommendation.rank}`} variant="success" />
            <SyntheticBadge is_synthetic={recommendation.isSynthetic} />
          </div>
          <div className="ssw-rec-card__heading">
            <div>
              <h2>{recommendation.displayName}</h2>
              <p>{[recommendation.ageRange, recommendation.mbti].filter(Boolean).join(" · ") || "공개 가능한 기본 정보만 표시"}</p>
            </div>
            <div className="ssw-rec-overall" aria-label={`종합 점수 ${recommendation.overall}점`}>
              <span>{recommendation.overall}</span>
              <small>overall</small>
            </div>
          </div>
          <p className="ssw-rec-summary">{recommendation.summaryKo}</p>
          <SubscoreBars recommendation={recommendation} />
          <div className="ssw-rec-highlights" aria-label="대화 하이라이트">
            {recommendation.highlights.length > 0 ? (
              recommendation.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)
            ) : (
              <span>공개 가능한 대화 하이라이트를 준비 중입니다.</span>
            )}
          </div>
          <div className="ssw-rec-actions">
            <Button loading={savingAction === "save"} onClick={() => runAction("save")} size="sm" variant="secondary">
              관심 표현/저장
            </Button>
            <Button loading={savingAction === "report"} onClick={() => runAction("report")} size="sm" variant="ghost">
              신고
            </Button>
            <Button loading={savingAction === "block"} onClick={() => runAction("block")} size="sm" variant="ghost">
              차단
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function RecommendationsWidget({ initialResult }: RecommendationsWidgetProps) {
  const [snapshot, setSnapshot] = useState<RecommendationsSnapshot>(() => (initialResult ? normalizeRecommendations(initialResult) : { recommendations: [] }));
  const [loading, setLoading] = useState(!initialResult);
  const [error, setError] = useState<string>();
  const visibleRecommendations = useMemo(() => snapshot.recommendations.slice(0, 10), [snapshot.recommendations]);

  async function loadSnapshot() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await callTool("list_recommendations", {});
      setSnapshot(normalizeRecommendations(result));
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "추천 결과를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsubscribe = handleToolResult((result) => {
      setSnapshot(normalizeRecommendations(result));
      setLoading(false);
      setError(undefined);
    });
    if (!initialResult) {
      void loadSnapshot();
    }
    return unsubscribe;
  }, []);

  useEffect(() => {
    setWidgetState({ widget: "recommendations", count: visibleRecommendations.length });
    notifyIntrinsicHeight(document.documentElement.scrollHeight);
  }, [visibleRecommendations.length, error, loading]);

  return (
    <div className="ssw-scope ssw-rec-shell" data-widget="recommendations">
      <GlobalStyles />
      <div className="ssw-rec-orb" />
      <Card className="ssw-rec-hero" padding="lg">
        <div className="ssw-rec-hero__row">
          <div>
            <Badge text="SoulSync AI" variant="success" />
            <h1>추천 매칭 후보</h1>
            <p>서버 스냅샷의 공개 정보와 위젯 전용 서명 사진만 사용해 보여드려요.</p>
          </div>
          <Badge text={`${visibleRecommendations.length}명`} variant="default" />
        </div>
        <ProgressBar label="추천 신뢰도" value={visibleRecommendations.length > 0 ? 100 : 0} />
      </Card>
      {error ? <ErrorState description={error} onRetry={loadSnapshot} title="추천을 불러오지 못했어요" /> : null}
      {!error && loading ? <EmptyState description="대화 평가와 공개 가능한 하이라이트를 불러오는 중입니다." title="추천 결과 준비 중" /> : null}
      {!error && !loading && visibleRecommendations.length === 0 ? (
        <EmptyState
          description={snapshot.explanation ?? "현재 공개 가능한 후보가 없거나 fallback 후보만 있어 추천 카드를 표시하지 않았어요."}
          title="표시할 추천 후보가 없어요"
        />
      ) : null}
      {!error && visibleRecommendations.length > 0 ? (
        <div className="ssw-rec-list">
          {visibleRecommendations.map((recommendation) => (
            <RecommendationCardView key={recommendation.candidateId} recommendation={recommendation} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function mountRecommendations(element: Element, initialResult?: unknown) {
  return createRoot(element).render(<RecommendationsWidget initialResult={initialResult} />);
}

if (typeof document !== "undefined") {
  const mount = document.querySelector("[data-soulsync-recommendations]");
  if (mount) {
    mountRecommendations(mount);
  }
}
