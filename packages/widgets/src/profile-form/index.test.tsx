// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenAIWidgetBridge, ToolResult } from "../bridge";
import { createEmptyConsent } from "../consent";
import { mountProfileForm } from "./index";

const STORAGE_KEY = "soulsync.profile-form.v1";

type MockCall = NonNullable<OpenAIWidgetBridge["callTool"]>;

function allGrantedConsent() {
  return Object.fromEntries(Object.keys(createEmptyConsent()).map((key) => [key, true]));
}

function storedPersonaState(overrides: Record<string, unknown> = {}) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      step: 6,
      birthYear: "1992",
      consent: allGrantedConsent(),
      answers: {},
      photo: { status: "idle" },
      persona: {
        id: "persona-test",
        displayName: "테스트 프로필",
        ageRange: "30대 초반",
        city: "서울",
        district: "성동구",
        interests: ["산책", "전시"],
        communicationStyle: "차분하게 대화해요.",
        boundaries: ["정확한 주소 공유 금지"],
        is_synthetic: false
      },
      ...overrides
    })
  );
}

function profileCardResult(html = '<article class="ggui-card"><h2>테스트 카드</h2><img data-ggui-slot="slot-1" alt="프로필 사진"></article>'): ToolResult {
  return {
    structuredContent: { profileCardId: "card-test" },
    _meta: {
      card: {
        version: "card-test-v1",
        generatorVersion: "ggui-test",
        html,
        css: ".ggui-card { display: grid; gap: 12px; }",
        placeholders: ["slot-1"],
        is_synthetic: true
      },
      photos: {
        "slot-1": "https://storage.example/profiles/slot-1.jpg?token=signed"
      }
    }
  };
}

function matchProfileCardResult(): ToolResult {
  return {
    structuredContent: { profileCardId: "card-candidate-1" },
    _meta: {
      card: {
        version: "card-candidate-1-v1",
        generatorVersion: "ggui-test",
        html: '<article class="ggui-card"><h2>민서 카드</h2><img data-ggui-slot="slot-1" alt="첫 번째 사진"><img data-ggui-slot="slot-2" alt="두 번째 사진"><img data-ggui-slot="slot-3" alt="세 번째 사진"></article>',
        css: ".ggui-card { display: grid; gap: 12px; }",
        placeholders: ["slot-1", "slot-2", "slot-3"],
        is_synthetic: true
      },
      photos: {
        "slot-1": "https://storage.example/profiles/slot-1.jpg?token=signed",
        "slot-2": "https://storage.example/profiles/slot-2.jpg?token=signed",
        "slot-3": "https://storage.example/profiles/slot-3.jpg?token=signed"
      }
    }
  };
}

function recommendationsResult(): ToolResult {
  return {
    structuredContent: {},
    _meta: {
      recommendations: [
        {
          id: "rec-1",
          candidateId: "candidate-1",
          rank: 1,
          overall: 92,
          subscores: { flow: 23, coherence: 18, mutual_curiosity: 18, values_alignment: 19, friction_risk: 2 },
          summaryKo: "대화 리듬과 장기 가치관이 안정적으로 맞는 후보입니다.",
          displayName: "민서",
          ageRange: "30대 초반",
          mbti: "ENFP",
          photoSignedUrl: "https://storage.example/profiles/candidate-1.jpg?token=signed",
          highlights: ["대화 속도가 잘 맞음"],
          is_synthetic: true,
          recommended: true
        }
      ]
    }
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 10));
      });
    }
  }
  throw lastError;
}

async function renderProfileForm(callTool: MockCall) {
  const host = document.createElement("div");
  document.body.append(host);
  const notifyIntrinsicHeight = vi.fn();
  const setWidgetState = vi.fn();
  window.openai = {
    callTool,
    notifyIntrinsicHeight,
    setWidgetState
  } satisfies OpenAIWidgetBridge;

  await act(async () => {
    mountProfileForm(host);
  });
  await flush();

  return { host, notifyIntrinsicHeight, setWidgetState };
}

function clickButton(host: HTMLElement, text: string) {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(text));
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

afterEach(() => {
  document.body.textContent = "";
  window.localStorage.clear();
  delete window.openai;
  vi.restoreAllMocks();
});

describe("ProfileFormWidget demo flow", () => {
  it("calls get_profile_card and renders sanitized card HTML after matching activation", async () => {
    storedPersonaState();
    const callTool = vi.fn<MockCall>(async (name) => {
      if (name === "save_profile_step") {
        return { structuredContent: { ok: true } };
      }
      if (name === "start_match_job") {
        return { structuredContent: { job: { id: "job-1", status: "queued" } }, _meta: { job: { id: "job-1" } } };
      }
      if (name === "get_profile_card") {
        return profileCardResult();
      }
      return { structuredContent: { ok: true } };
    });
    const { host, setWidgetState } = await renderProfileForm(callTool);

    await act(async () => {
      clickButton(host, "매칭 시작");
    });

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("get_profile_card", {});
      expect(host.textContent).toContain("당신의 프로필 카드가 완성됐어요");
      expect(host.textContent).toContain("테스트 카드");
    });

    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector(".ssw-profile-card-root img")?.getAttribute("src")).toBe("https://storage.example/profiles/slot-1.jpg?token=signed");
    expect(setWidgetState).toHaveBeenCalledWith(expect.objectContaining({ demoStage: "card", matchJobId: "job-1" }));
  });

  it("polls the match job, calls list_recommendations, and renders the top candidate profile card", async () => {
    storedPersonaState({ demoStage: "matching", matchJobId: "job-1" });
    const callTool = vi.fn<MockCall>(async (name) => {
      if (name === "get_match_job") {
        return { structuredContent: { job: { id: "job-1", status: "succeeded" } }, _meta: { job: { id: "job-1", status: "succeeded" } } };
      }
      if (name === "list_recommendations") {
        return recommendationsResult();
      }
      if (name === "get_profile_card") {
        return matchProfileCardResult();
      }
      return { structuredContent: { ok: true } };
    });
    const { host } = await renderProfileForm(callTool);

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("get_match_job", { jobId: "job-1" });
      expect(callTool).toHaveBeenCalledWith("list_recommendations", {});
      expect(callTool).toHaveBeenCalledWith("get_profile_card", { candidateId: "candidate-1" });
      expect(host.textContent).toContain("당신과 가장 잘 맞는 상대");
      expect(host.textContent).toContain("민서 카드");
      expect(host.querySelectorAll(".ssw-profile-card-root img").length).toBe(3);
    });

    const photos = Array.from(host.querySelectorAll(".ssw-profile-card-root img")).map((image) => image.getAttribute("src"));
    expect(photos).toEqual([
      "https://storage.example/profiles/slot-1.jpg?token=signed",
      "https://storage.example/profiles/slot-2.jpg?token=signed",
      "https://storage.example/profiles/slot-3.jpg?token=signed"
    ]);
  });

  it("sanitizes malicious profile card HTML before rendering the inline card stage", async () => {
    storedPersonaState({ demoStage: "card", matchJobId: "job-1" });
    const callTool = vi.fn<MockCall>(async (name) => {
      if (name === "get_profile_card") {
        return profileCardResult('<article class="ggui-card"><img src="x" onerror="alert(1)" data-ggui-slot="slot-1" alt="공격 이미지"><script>alert(1)</script><h2>안전 카드</h2></article>');
      }
      return { structuredContent: { ok: true } };
    });
    const { host } = await renderProfileForm(callTool);

    await waitFor(() => {
      expect(host.textContent).toContain("안전 카드");
    });

    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("[onerror]")).toBeNull();
    expect(host.querySelector(".ssw-profile-card-root img")?.getAttribute("src")).toBe("https://storage.example/profiles/slot-1.jpg?token=signed");
  });
});
