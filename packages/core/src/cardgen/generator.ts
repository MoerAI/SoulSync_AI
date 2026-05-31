import type { CardGenInput, CardGenOutput } from "./types";

export interface GguiLike {
  generateCard(input: CardGenInput): Promise<CardGenOutput>;
}

export class MockGgui implements GguiLike {
  async generateCard(input: CardGenInput): Promise<CardGenOutput> {
    const subtitle = [input.ageRange, input.city].filter(isPresent).map(escapeHtml).join(" · ");
    const interests = input.interests.map((interest) => `<li>${escapeHtml(interest)}</li>`).join("");
    const photos = input.photoSlots.map((slot) => `<img data-ggui-slot="${escapeAttribute(slot)}" alt="profile photo">`).join("");
    const subtitleHtml = subtitle.length > 0 ? `<p class="ggui-card__subtitle">${subtitle}</p>` : "";

    return {
      html: `<article class="ggui-card"><header><h2>${escapeHtml(input.displayName)}</h2>${subtitleHtml}</header><ul class="ggui-card__interests">${interests}</ul><figure class="ggui-card__photos">${photos}</figure></article>`,
      css: ".ggui-card{display:grid;gap:12px;padding:20px;border-radius:18px;background:#fff;color:#1f2933}.ggui-card h2{margin:0;font-size:24px}.ggui-card__subtitle{margin:4px 0 0;color:#52606d}.ggui-card__interests{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}.ggui-card__interests li{padding:6px 10px;border-radius:999px;background:#eef2f7}.ggui-card__photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;margin:0}.ggui-card__photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;background:#d9e2ec}",
    };
  }
}

export function createGguiGenerator(): GguiLike {
  // TODO(T-real): swap to real @ggui-ai/ui-gen adapter when GGUI_API_KEY set
  return new MockGgui();
}

const isPresent = (value: string | undefined): value is string => value !== undefined && value.length > 0;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttribute = escapeHtml;
