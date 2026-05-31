import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

// Content-presence contract for the SoulSync AI landing page.
// Fact-corrected: friendli.ai EXAONE (not Claude) + real MCP tool names from the registry.
const html = renderToStaticMarkup(<HomePage />);

describe("SoulSync AI landing page (/)", () => {
  it("renders the hero title and subtitle", () => {
    expect(html).toContain("SoulSync AI");
    expect(html).toContain("AI 페르소나가 대신 데이트하는 ChatGPT 앱");
    expect(html).toContain("AI가 먼저 대화해보고 궁합을 확인해 매칭해드립니다");
  });

  it("exposes all 9 section anchor ids for in-page navigation", () => {
    for (const id of ["hero", "problem", "solution", "how", "architecture", "tools", "widget", "demo", "why"]) {
      expect(html, `missing section id="${id}"`).toContain(`id="${id}"`);
    }
  });

  it("renders all section headings", () => {
    for (const heading of [
      "데이팅 앱, 매번 헛걸음하는 이유",
      "만약, AI가 먼저 대화해본다면?",
      "5단계, 3분이면 끝",
      "ChatGPT Apps SDK + MCP + EXAONE의 만남",
      "MCP Tool",
      "친숙한 Tinder UX",
      "두 AI가 진짜로 대화한다",
      "왜 지금, 왜 ChatGPT인가"
    ]) {
      expect(html, `missing heading: ${heading}`).toContain(heading);
    }
  });

  it("lists the real MCP tool names from the registry", () => {
    for (const tool of [
      "save_profile_step",
      "generate_persona",
      "start_match_job",
      "get_match_job",
      "list_recommendations",
      "get_profile_card"
    ]) {
      expect(html, `missing tool: ${tool}`).toContain(tool);
    }
  });

  it("is factually accurate: EXAONE present; Claude + PPT placeholder tools absent", () => {
    expect(html).toContain("EXAONE");
    expect(html).not.toContain("Claude");
    for (const placeholder of ["create_profile", "find_matches", "run_conversation", "get_results", "get_notifications"]) {
      expect(html, `stale placeholder tool still present: ${placeholder}`).not.toContain(placeholder);
    }
  });

  it("preserves key marketing copy", () => {
    expect(html).toContain("궁합 92점");
    expect(html).toContain("8억+");
    expect(html).toContain("데이팅 앱의 다음 진화는");
  });
});
