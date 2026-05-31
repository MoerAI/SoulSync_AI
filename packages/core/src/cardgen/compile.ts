import sanitizeHtml from "sanitize-html";

import { CardArtifactSchema, type CardArtifact, type CardGenOutput } from "./types";

type CardArtifactMeta = {
  version: string;
  generatorVersion: string;
  is_synthetic: boolean;
  photoSlots: string[];
};

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "ul", "ol", "li", "img", "figure", "figcaption", "strong", "em", "small", "br", "hr"],
  allowedAttributes: {
    "*": ["class"],
    img: ["data-ggui-slot", "alt"],
  },
  allowedSchemes: ["http", "https"],
  disallowedTagsMode: "discard",
};

export function compileCardArtifact(output: CardGenOutput, meta: CardArtifactMeta): CardArtifact {
  const allowedSlots = new Set(meta.photoSlots);
  const sanitized = sanitizeHtml(output.html, SANITIZE_OPTIONS);
  const html = stripUnknownSlotImages(sanitized, allowedSlots);
  const placeholders = extractPlaceholders(html, allowedSlots);

  return CardArtifactSchema.parse({
    version: meta.version,
    generatorVersion: meta.generatorVersion,
    html,
    css: scopeCss(output.css),
    placeholders,
    is_synthetic: meta.is_synthetic,
  });
}

const stripUnknownSlotImages = (html: string, allowedSlots: Set<string>): string =>
  html.replace(/<img\b[^>]*data-ggui-slot="([^"]+)"[^>]*>/g, (tag, slot: string) => (allowedSlots.has(slot) ? tag : ""));

const extractPlaceholders = (html: string, allowedSlots: Set<string>): string[] => {
  const placeholders: string[] = [];

  for (const match of html.matchAll(/data-ggui-slot="([^"]+)"/g)) {
    const slot = match[1];

    if (slot && allowedSlots.has(slot) && !placeholders.includes(slot)) {
      placeholders.push(slot);
    }
  }

  return placeholders;
};

const scopeCss = (css: string): string => {
  const scopedRules: string[] = [];

  for (const rawRule of css.split("}")) {
    const [rawSelectors, rawBody] = rawRule.split("{");

    if (!rawSelectors || !rawBody) {
      continue;
    }

    const selectors = rawSelectors
      .split(",")
      .map((selector) => selector.trim())
      .filter((selector) => selector.length > 0 && !isGlobalSelector(selector))
      .map((selector) => (selector.includes(".ggui-card") ? selector : `.ggui-card ${selector}`));

    if (selectors.length > 0) {
      scopedRules.push(`${selectors.join(",")}{${rawBody.trim()}}`);
    }
  }

  return scopedRules.join("");
};

const isGlobalSelector = (selector: string): boolean => /(^|[\s>+~,])(?:body|html|\*)(?=$|[\s.#:[>+~,])/.test(selector);
