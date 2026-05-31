import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { callTool, handleToolResult, notifyIntrinsicHeight, setWidgetState, type ToolResult } from "../bridge";
import { Badge, Card, EmptyState, ErrorState, SyntheticBadge } from "../components";
import { GlobalStyles } from "../theme";
import { normalizeProfileCard, SanitizedProfileCard, type ProfileCardSnapshot } from "./rendering";
import "./styles.css";

type ProfileCardWidgetProps = {
  initialResult?: ToolResult | unknown;
};

export { bindPhotoSlots, normalizeProfileCard, SanitizedProfileCard, sanitizedHtmlFrom, scopeCss, type CardArtifact, type ProfileCardSnapshot } from "./rendering";

export function ProfileCardWidget({ initialResult }: ProfileCardWidgetProps) {
  const [snapshot, setSnapshot] = useState<ProfileCardSnapshot>(() => (initialResult ? normalizeProfileCard(initialResult) : { photos: {} }));
  const [loading, setLoading] = useState(!initialResult);
  const [error, setError] = useState<string>();
  const [photoSlots, setPhotoSlots] = useState(0);

  async function loadProfileCard() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await callTool("get_profile_card", {});
      setSnapshot(normalizeProfileCard(result));
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "프로필 카드를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsubscribe = handleToolResult((result) => {
      setSnapshot(normalizeProfileCard(result));
      setLoading(false);
      setError(undefined);
    });
    if (!initialResult) {
      void loadProfileCard();
    }
    return unsubscribe;
  }, []);

  useEffect(() => {
    setWidgetState({ widget: "profile-card", version: snapshot.card?.version, photoSlots, isSynthetic: Boolean(snapshot.card?.is_synthetic) });
    notifyIntrinsicHeight(document.documentElement.scrollHeight);
  }, [photoSlots, snapshot.card?.version, snapshot.card?.is_synthetic]);

  const handlePhotoSlotsBound = useCallback((nextPhotoSlots: number) => {
    setPhotoSlots(nextPhotoSlots);
  }, []);

  return (
    <div className="ssw-scope ssw-profile-card-shell" data-widget="profile-card">
      <GlobalStyles />
      <div className="ssw-profile-card-orb" />
      <Card className="ssw-profile-card-frame" padding="lg">
        <div className="ssw-profile-card-header">
          <div>
            <Badge text="SoulSync AI" variant="success" />
            <h1>프로필 카드</h1>
            <p>매칭된 사용자에게 공개 가능한 카드와 위젯 전용 서명 사진만 보여드려요.</p>
          </div>
          <SyntheticBadge is_synthetic={Boolean(snapshot.card?.is_synthetic)} />
        </div>
        {error ? <ErrorState description={error} onRetry={loadProfileCard} title="프로필 카드를 불러오지 못했어요" /> : null}
        {!error && loading ? <EmptyState description="저장된 GGUI 프로필 카드와 안전한 사진 링크를 불러오는 중입니다." title="프로필 카드 준비 중" /> : null}
        {!error && !loading && !snapshot.card ? <EmptyState description="아직 표시할 프로필 카드가 없어요. 프로필 생성 후 다시 확인해 주세요." title="카드가 비어 있어요" /> : null}
        {!error && snapshot.card ? <SanitizedProfileCard onPhotoSlotsBound={handlePhotoSlotsBound} snapshot={snapshot} /> : null}
      </Card>
    </div>
  );
}

export function mountProfileCard(element: Element, initialResult?: unknown) {
  return createRoot(element).render(<ProfileCardWidget initialResult={initialResult} />);
}

if (typeof document !== "undefined") {
  const mount = document.querySelector("[data-soulsync-profile-card]");
  if (mount) {
    mountProfileCard(mount);
  }
}
