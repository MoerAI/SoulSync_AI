// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { BrandLogo } from "./BrandLogo";

afterEach(() => {
  document.body.textContent = "";
  Reflect.deleteProperty(window, "__SOULSYNC_APP_ORIGIN__");
});

describe("BrandLogo", () => {
  it("renders the SoulSync mark from the injected app origin", async () => {
    Object.defineProperty(window, "__SOULSYNC_APP_ORIGIN__", { configurable: true, value: "https://app.example" });
    const host = document.createElement("div");
    document.body.append(host);

    await act(async () => {
      createRoot(host).render(<BrandLogo />);
    });

    const image = host.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("alt")).toBe("SoulSync AI");
    expect(image?.getAttribute("src")).toBe("https://app.example/soulsync-mark.png");
    expect(image?.getAttribute("src")?.endsWith("/soulsync-mark.png")).toBe(true);
  });
});
