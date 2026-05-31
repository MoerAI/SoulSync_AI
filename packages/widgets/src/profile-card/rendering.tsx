import DOMPurify from "dompurify";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

export type CardArtifact = {
  version: string;
  generatorVersion: string;
  html: string;
  css: string;
  placeholders: string[];
  is_synthetic: boolean;
};

export type ProfileCardSnapshot = {
  card?: CardArtifact;
  photos: Record<string, string>;
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

export function scopeCss(css: string) {
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

export function sanitizedHtmlFrom(card: CardArtifact) {
  return DOMPurify.sanitize(card.html, { ADD_ATTR: ["data-ggui-slot"] });
}

export function bindPhotoSlots(root: HTMLElement | null, photos: Record<string, string>) {
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

type SanitizedProfileCardProps = {
  snapshot: ProfileCardSnapshot;
  onPhotoSlotsBound?: (photoSlots: number) => void;
};

export function SanitizedProfileCard({ snapshot, onPhotoSlotsBound }: SanitizedProfileCardProps) {
  const cardRootRef = useRef<HTMLDivElement>(null);
  const sanitizedHtml = useMemo(() => (snapshot.card ? sanitizedHtmlFrom(snapshot.card) : ""), [snapshot.card]);
  const scopedCss = useMemo(() => (snapshot.card ? scopeCss(snapshot.card.css) : ""), [snapshot.card]);

  const bindCardRoot = useCallback((node: HTMLDivElement | null) => {
    cardRootRef.current = node;
    if (node) {
      onPhotoSlotsBound?.(bindPhotoSlots(node, snapshot.photos));
      window.queueMicrotask(() => {
        onPhotoSlotsBound?.(bindPhotoSlots(node, snapshot.photos));
      });
    }
  }, [onPhotoSlotsBound, snapshot.photos]);

  useLayoutEffect(() => {
    onPhotoSlotsBound?.(bindPhotoSlots(cardRootRef.current, snapshot.photos));
    window.queueMicrotask(() => {
      onPhotoSlotsBound?.(bindPhotoSlots(cardRootRef.current, snapshot.photos));
    });
  }, [onPhotoSlotsBound, sanitizedHtml, snapshot.photos]);

  if (!snapshot.card) {
    return null;
  }

  return (
    <>
      {scopedCss ? <style>{scopedCss}</style> : null}
      <div className="ssw-profile-card-stage" aria-label="저장된 프로필 카드">
        <div className="ssw-profile-card-root" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} ref={bindCardRoot} />
      </div>
    </>
  );
}
