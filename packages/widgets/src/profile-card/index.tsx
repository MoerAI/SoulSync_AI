import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { callTool, handleToolResult, notifyIntrinsicHeight, setWidgetState, type ToolResult } from "../bridge";
import { Badge, Card, EmptyState, ErrorState, SyntheticBadge } from "../components";
import { GlobalStyles } from "../theme";
import "./styles.css";

type CardArtifact = {
  version: string;
  generatorVersion: string;
  html: string;
  css: string;
  placeholders: string[];
  is_synthetic: boolean;
};

type ProfileCardSnapshot = {
  card?: CardArtifact;
  photos: Record<string, string>;
};

type ProfileCardWidgetProps = {
  initialResult?: ToolResult | unknown;
};

const PROFILE_CARD_SCOPE = ".ssw-profile-card-root";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function metaContent(result: unknown): Record<string, unknown> {
  return asRecord(asRecord(result)?._meta) ?? {};
}

function normalizeCard(value: unknown): CardArtifact | undefined {
  const card = asRecord(value);
  const version = stringFrom(card?.version);
  const generatorVersion = stringFrom(card?.generatorVersion);
  const html = stringFrom(card?.html);
  const css = stringFrom(card?.css);
  if (!version || !generatorVersion || html === undefined || css === undefined) {
    return undefined;
  }
  return {
    version,
    generatorVersion,
    html,
    css,
    placeholders: stringArrayFrom(card?.placeholders),
    is_synthetic: Boolean(card?.is_synthetic)
  };
}

function normalizePhotos(value: unknown): Record<string, string> {
  const photos = asRecord(value) ?? {};
  return Object.fromEntries(Object.entries(photos).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0));
}

export function normalizeProfileCard(result: unknown): ProfileCardSnapshot {
  const meta = metaContent(result);
  return {
    card: normalizeCard(meta.card),
    photos: normalizePhotos(meta.photos)
  };
}

function scopeSimpleSelector(selector: string) {
  const trimmed = selector.trim();
  if (!trimmed || trimmed.startsWith(PROFILE_CARD_SCOPE)) {
    return trimmed;
  }
  if (trimmed.startsWith(":root") || trimmed.startsWith("html") || trimmed.startsWith("body")) {
    return trimmed.replace(/^(?::root|html|body)/u, PROFILE_CARD_SCOPE);
  }
  return `${PROFILE_CARD_SCOPE} ${trimmed}`;
}

function findMatchingBrace(css: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      depth += 1;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return css.length - 1;
}

function shouldScopeAtRuleBody(selector: string) {
  return selector.startsWith("@media") || selector.startsWith("@supports") || selector.startsWith("@container") || selector.startsWith("@layer");
}

function scopeCss(css: string) {
  let scoped = "";
  let cursor = 0;

  while (cursor < css.length) {
    const openIndex = css.indexOf("{", cursor);
    if (openIndex === -1) {
      scoped += css.slice(cursor);
      break;
    }

    const selector = css.slice(cursor, openIndex).trim();
    const closeIndex = findMatchingBrace(css, openIndex);
    const body = css.slice(openIndex + 1, closeIndex);

    if (selector.startsWith("@")) {
      scoped += `${selector} {${shouldScopeAtRuleBody(selector) ? scopeCss(body) : body}}`;
    } else {
      scoped += `${selector.split(",").map(scopeSimpleSelector).join(", ")} {${body}}`;
    }

    cursor = closeIndex + 1;
  }

  return scoped;
}

function sanitizedHtmlFrom(card: CardArtifact) {
  return DOMPurify.sanitize(card.html, { ADD_ATTR: ["data-ggui-slot"] });
}

function bindPhotoSlots(root: HTMLElement | null, photos: Record<string, string>) {
  if (!root) {
    return 0;
  }

  const slottedElements = Array.from(root.querySelectorAll<HTMLElement>("[data-ggui-slot]"));
  slottedElements.forEach((element) => {
    const slotId = element.getAttribute("data-ggui-slot");
    if (!slotId) {
      return;
    }
    const signedUrl = photos[slotId];
    if (signedUrl && element instanceof HTMLImageElement) {
      element.src = signedUrl;
      return;
    }
    if (signedUrl) {
      element.setAttribute("data-ggui-photo-url", signedUrl);
      return;
    }
    const fallback = document.createElement("div");
    fallback.className = "ssw-profile-card-photo-fallback";
    fallback.dataset.gguiFallbackSlot = slotId;
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", `${slotId} 사진 준비 중`);
    fallback.textContent = "사진 준비 중";
    element.replaceWith(fallback);
  });

  return slottedElements.length;
}

export function ProfileCardWidget({ initialResult }: ProfileCardWidgetProps) {
  const [snapshot, setSnapshot] = useState<ProfileCardSnapshot>(() => (initialResult ? normalizeProfileCard(initialResult) : { photos: {} }));
  const [loading, setLoading] = useState(!initialResult);
  const [error, setError] = useState<string>();
  const cardRootRef = useRef<HTMLDivElement>(null);
  const sanitizedHtml = useMemo(() => (snapshot.card ? sanitizedHtmlFrom(snapshot.card) : ""), [snapshot.card]);
  const scopedCss = useMemo(() => (snapshot.card ? scopeCss(snapshot.card.css) : ""), [snapshot.card]);

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
    const photoSlots = bindPhotoSlots(cardRootRef.current, snapshot.photos);
    setWidgetState({ widget: "profile-card", version: snapshot.card?.version, photoSlots, isSynthetic: Boolean(snapshot.card?.is_synthetic) });
    notifyIntrinsicHeight(document.documentElement.scrollHeight);
  }, [sanitizedHtml, snapshot.photos, snapshot.card?.version, snapshot.card?.is_synthetic]);

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
        {scopedCss ? <style>{scopedCss}</style> : null}
        {error ? <ErrorState description={error} onRetry={loadProfileCard} title="프로필 카드를 불러오지 못했어요" /> : null}
        {!error && loading ? <EmptyState description="저장된 GGUI 프로필 카드와 안전한 사진 링크를 불러오는 중입니다." title="프로필 카드 준비 중" /> : null}
        {!error && !loading && !snapshot.card ? <EmptyState description="아직 표시할 프로필 카드가 없어요. 프로필 생성 후 다시 확인해 주세요." title="카드가 비어 있어요" /> : null}
        {!error && snapshot.card ? (
          <div className="ssw-profile-card-stage" aria-label="저장된 프로필 카드">
            <div className="ssw-profile-card-root" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} ref={cardRootRef} />
          </div>
        ) : null}
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
