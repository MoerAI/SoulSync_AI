// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountProfileCard } from "./index";
import type { OpenAIWidgetBridge, ToolResult } from "../bridge";

type ProfileCardMeta = {
  card: {
    version: string;
    generatorVersion: string;
    html: string;
    css: string;
    placeholders: string[];
    is_synthetic: boolean;
  };
  photos: Record<string, string>;
};

function toolResult(meta: ProfileCardMeta): ToolResult {
  return {
    structuredContent: { ignoredPhotoUrl: "https://structured.example/never-used.jpg" },
    _meta: meta
  };
}

function profileMeta(overrides: Partial<ProfileCardMeta["card"]> = {}, photos: Record<string, string> = {}) {
  return {
    card: {
      version: "card-v1",
      generatorVersion: "ggui-2026-05-31",
      html: '<article class="ggui-card"><img data-ggui-slot="slot-1" alt="첫 번째 프로필 사진"><img data-ggui-slot="slot-2" alt="두 번째 프로필 사진"></article>',
      css: ".ggui-card { display: grid; gap: 12px; } .ggui-card img { width: 100%; }",
      placeholders: ["slot-1", "slot-2"],
      is_synthetic: false,
      ...overrides
    },
    photos
  };
}

async function renderProfileCard(result: ToolResult) {
  const host = document.createElement("div");
  document.body.append(host);
  const notifyIntrinsicHeight = vi.fn();
  const setWidgetState = vi.fn();
  window.openai = {
    notifyIntrinsicHeight,
    setWidgetState
  } satisfies OpenAIWidgetBridge;

  await act(async () => {
    mountProfileCard(host, result);
  });

  await act(async () => {
    await Promise.resolve();
  });

  return { host, notifyIntrinsicHeight, setWidgetState };
}

afterEach(() => {
  document.body.textContent = "";
  delete window.openai;
  vi.restoreAllMocks();
});

describe("ProfileCardWidget", () => {
  it("binds signed _meta.photos URLs onto the matching GGUI slots", async () => {
    const slotOne = "https://storage.supabase.co/object/sign/profiles/slot-1.jpg?token=signed-one";
    const slotTwo = "https://storage.supabase.co/object/sign/profiles/slot-2.jpg?token=signed-two";
    const { host, notifyIntrinsicHeight, setWidgetState } = await renderProfileCard(toolResult(profileMeta({}, { "slot-1": slotOne, "slot-2": slotTwo })));

    const images = Array.from(host.querySelectorAll<HTMLImageElement>(".ssw-profile-card-root img[data-ggui-slot]"));

    expect(images).toHaveLength(2);
    expect(images[0].src).toBe(slotOne);
    expect(images[1].src).toBe(slotTwo);
    expect(setWidgetState).toHaveBeenCalledWith({ widget: "profile-card", version: "card-v1", photoSlots: 2, isSynthetic: false });
    expect(notifyIntrinsicHeight).toHaveBeenCalled();
  });

  it("shows SyntheticBadge only for synthetic profile cards", async () => {
    const synthetic = await renderProfileCard(toolResult(profileMeta({ is_synthetic: true }, { "slot-1": "https://storage.supabase.co/object/sign/profiles/slot-1.jpg?token=signed" })));
    expect(synthetic.host.textContent).toContain("AI 프로필");

    document.body.textContent = "";

    const organic = await renderProfileCard(toolResult(profileMeta({ is_synthetic: false }, { "slot-1": "https://storage.supabase.co/object/sign/profiles/slot-1.jpg?token=signed" })));
    expect(organic.host.textContent).not.toContain("AI 프로필");
  });

  it("replaces missing photo slots with a neutral fallback and no empty or broken image", async () => {
    const { host } = await renderProfileCard(toolResult(profileMeta({}, { "slot-1": "https://storage.supabase.co/object/sign/profiles/slot-1.jpg?token=signed" })));

    const missingImage = host.querySelector<HTMLImageElement>('img[data-ggui-slot="slot-2"]');
    const fallback = host.querySelector('[data-ggui-fallback-slot="slot-2"]');

    expect(missingImage).toBeNull();
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain("사진 준비 중");
    expect(Array.from(host.querySelectorAll<HTMLImageElement>("img[data-ggui-slot]")).every((image) => image.src.length > 0)).toBe(true);
  });

  it("sanitizes malicious card HTML before rendering", async () => {
    const { host } = await renderProfileCard(
      toolResult(
        profileMeta({
          html: '<img src=x onerror=alert(1) data-ggui-slot="slot-1" alt="공격 이미지"><script>alert(1)</script>'
        })
      )
    );

    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("[onerror]")).toBeNull();
    expect(host.querySelector(".ssw-profile-card-root img")?.getAttribute("src")).not.toBe("x");
  });
});
