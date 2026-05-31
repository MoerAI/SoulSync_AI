import { describe, expect, test, vi } from "vitest";

type ToolConfig = { description?: string };

class FakeMcpServer {
  readonly tools = new Map<string, ToolConfig>();

  registerTool(name: string, config: ToolConfig): void {
    this.tools.set(name, config);
  }

  registerResource(): void {}
}

const mcpHandlerCapture = vi.hoisted(() => ({
  initializeServer: undefined as undefined | ((server: FakeMcpServer) => void | Promise<void>),
  serverOptions: undefined as unknown,
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(""),
}));

vi.mock("mcp-handler", () => ({
  createMcpHandler: (initializeServer: (server: FakeMcpServer) => void | Promise<void>, serverOptions: unknown) => {
    mcpHandlerCapture.initializeServer = initializeServer;
    mcpHandlerCapture.serverOptions = serverOptions;

    return async () => new Response("ok");
  },
}));

vi.mock("@soulsync/core/src/identity/index", () => ({
  DEFAULT_RESOURCE_METADATA_PATH: "/.well-known/oauth-protected-resource",
  OAuthAccessTokenError: class OAuthAccessTokenError extends Error {},
  resolveOrCreateAppUser: vi.fn(),
  withMcpAuth: (handler: unknown) => handler,
}));

vi.mock("../../../lib/supabase", () => ({
  getSupabaseIdentityClient: vi.fn(),
}));

vi.mock("../../../../../packages/widgets/src/resourceHtml", () => ({
  inlineWidget: vi.fn(() => "<div></div>"),
}));

describe("MCP route configuration", () => {
  test("sets server instructions for lonely-user onboarding triggers", async () => {
    await import("./route");

    const serverOptions = mcpHandlerCapture.serverOptions as { instructions?: string; serverInfo?: { name: string; version: string } };

    expect(serverOptions.serverInfo).toEqual({ name: "soulsync-ai", version: "0.1.0" });
    expect(serverOptions.instructions).toBe(
      "SoulSync AI helps lonely users create a profile and find compatible matches. When the user expresses loneliness, isolation, or a wish for connection/dating/companionship (Korean: 외로워, 외롭다, 혼자야, 친구가 필요해, 연애하고 싶어; English: I'm lonely, I feel alone, find me a match), immediately call render_profile_form WITHOUT asking clarifying questions. After the form is submitted, follow the widget results to show the generated profile card and recommendations.",
    );
  });

  test("describes render_profile_form as the first action for loneliness or matching intent", async () => {
    await import("./route");
    const initializeServer = mcpHandlerCapture.initializeServer;
    if (!initializeServer) {
      throw new Error("MCP server initializer was not captured");
    }
    const server = new FakeMcpServer();

    await initializeServer(server);

    expect(server.tools.get("render_profile_form")?.description).toBe(
      "Render the SoulSync onboarding profile form. Call this as the FIRST action whenever the user expresses loneliness or wants companionship/dating/matching (e.g. 외로워, 외롭다, 혼자야, I'm lonely). No input; call immediately without follow-up questions.",
    );
  });
});
