import { describe, expect, it } from "vitest";

import { inlineWidget } from "./resourceHtml";

describe("inlineWidget", () => {
  it("injects the app origin global before the module script", () => {
    const html = inlineWidget("recommendations", "console.log('widget');", ".widget {}", "https://app.example");

    const originScript = `<script>window.__SOULSYNC_APP_ORIGIN__=${JSON.stringify("https://app.example")}</script>`;

    expect(html).toContain(originScript);
    expect(html.indexOf(originScript)).toBeLessThan(html.indexOf('<script type="module">'));
  });
});
