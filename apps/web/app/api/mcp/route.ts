import { readFile } from "node:fs/promises";

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { DEFAULT_RESOURCE_METADATA_PATH, OAuthAccessTokenError, resolveOrCreateAppUser, withMcpAuth } from "@soulsync/core/src/identity/index";
import { inlineWidget, type WidgetResourceName } from "../../../../../packages/widgets/src/resourceHtml";
import { getSupabaseIdentityClient } from "../../../lib/supabase";
import { blockProfile, blockProfileInput } from "./tools/block_profile";
import { deleteAccount, deleteAccountInput } from "./tools/delete_account";
import { generatePersona, generatePersonaInput } from "./tools/generate_persona";
import { getMatchJob, getMatchJobInput } from "./tools/get_match_job";
import { getProfileCard, getProfileCardInput } from "./tools/get_profile_card";
import { listRecommendations, listRecommendationsInput } from "./tools/list_recommendations";
import { reportProfile, reportProfileInput } from "./tools/report_profile";
import { matchStatusResourceUri, renderMatchStatus } from "./tools/render_match_status";
import { profileFormResourceUri, renderProfileForm } from "./tools/render_profile_form";
import { recommendationsResourceUri, renderRecommendations } from "./tools/render_recommendations";
import { profileCardResourceUri, renderProfileCard } from "./tools/render_profile_card";
import { runWithClaims } from "./tools/context";
import { saveProfileConsent, saveProfileConsentInput } from "./tools/save_profile_consent";
import { saveProfileStep, saveProfileStepInput } from "./tools/save_profile_step";
import { saveRecommendation, saveRecommendationInput } from "./tools/save_recommendation";
import { startMatchJob, startMatchJobInput } from "./tools/start_match_job";
import { startProfileCardJob, startProfileCardJobInput } from "./tools/start_profile_card_job";
import { updatePersona, updatePersonaInput } from "./tools/update_persona";
import { uploadProfilePhoto, uploadProfilePhotoInput } from "./tools/upload_profile_photo";

export const dynamic = "force-dynamic";

const RESOURCE_MIME_TYPE = "text/html+skybridge";

const mcpHandler = createMcpHandler(
  async (server) => {
    registerDataTools(server);
    registerRenderTools(server);
    await registerWidgetResources(server);
  },
  {
    serverInfo: { name: "soulsync-ai", version: "0.1.0" },
    instructions:
      "SoulSync AI helps lonely users create a profile and find compatible matches. When the user expresses loneliness, isolation, or a wish for connection/dating/companionship (Korean: 외로워, 외롭다, 혼자야, 친구가 필요해, 연애하고 싶어; English: I'm lonely, I feel alone, find me a match), immediately call render_profile_form WITHOUT asking clarifying questions. After the form is submitted, follow the widget results to show the generated profile card and recommendations.",
  },
  { basePath: "/api", maxDuration: 60, disableSse: true },
);

const handler = withMcpAuth(
  async (request, claims) => {
    const resolution = await resolveOrCreateAppUser(claims, getSupabaseIdentityClient());
    if (resolution.status === "pending-link" || !resolution.appUserId) {
      throw new OAuthAccessTokenError("invalid_token", "OAuth identity must be linked before using SoulSync MCP tools");
    }

    return runWithClaims(resolution.claims, () => mcpHandler(request));
  },
  {
    resourceMetadataPath: DEFAULT_RESOURCE_METADATA_PATH,
    resourceUrl: process.env.OAUTH_AUDIENCE,
    requiredScopes: [],
  },
);

export { handler as DELETE, handler as GET, handler as POST };

function registerDataTools(server: McpServerLike): void {
  server.registerTool(
    "save_profile_step",
    {
      title: "Save Profile Step",
      description: "Save one SoulSync onboarding profile step.",
      inputSchema: saveProfileStepInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    saveProfileStep,
  );
  server.registerTool(
    "save_profile_consent",
    {
      title: "Save Profile Consent",
      description: "Save SoulSync consent ledger entries.",
      inputSchema: saveProfileConsentInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    saveProfileConsent,
  );
  server.registerTool(
    "generate_persona",
    {
      title: "Generate Persona",
      description: "Generate a privacy-filtered SoulSync persona preview.",
      inputSchema: generatePersonaInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    generatePersona,
  );
  server.registerTool(
    "update_persona",
    {
      title: "Update Persona",
      description: "Update the user's SoulSync persona preview.",
      inputSchema: updatePersonaInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    updatePersona,
  );
  server.registerTool(
    "upload_profile_photo",
    {
      title: "Upload Profile Photo",
      description: "Store an uploaded profile photo for moderation.",
      inputSchema: uploadProfilePhotoInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      _meta: { "openai/fileParams": ["file"] },
    },
    uploadProfilePhoto,
  );
  server.registerTool(
    "start_match_job",
    {
      title: "Start Match Job",
      description: "Enqueue a background SoulSync matching job.",
      inputSchema: startMatchJobInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    startMatchJob,
  );
  server.registerTool(
    "start_profile_card_job",
    {
      title: "Start Profile Card Job",
      description: "Enqueue a background SoulSync profile card generation job.",
      inputSchema: startProfileCardJobInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    startProfileCardJob,
  );
  server.registerTool(
    "get_match_job",
    {
      title: "Get Match Job",
      description: "Read the current status of a SoulSync matching job.",
      inputSchema: getMatchJobInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    getMatchJob,
  );
  server.registerTool(
    "get_profile_card",
    {
      title: "Get Profile Card",
      description: "Get a stored GGUI profile card (the user's own, or a matched candidate's) with widget-only signed photos.",
      inputSchema: getProfileCardInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: profileCardResourceUri }, "openai/outputTemplate": profileCardResourceUri },
    },
    getProfileCard,
  );
  server.registerTool(
    "list_recommendations",
    {
      title: "List Recommendations",
      description: "List minimal safe SoulSync recommendation summaries.",
      inputSchema: listRecommendationsInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: recommendationsResourceUri }, "openai/outputTemplate": recommendationsResourceUri },
    },
    listRecommendations,
  );
  server.registerTool(
    "save_recommendation",
    {
      title: "Save Recommendation",
      description: "Record interest in a SoulSync recommendation.",
      inputSchema: saveRecommendationInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    saveRecommendation,
  );
  server.registerTool(
    "report_profile",
    {
      title: "Report Profile",
      description: "Report a profile for safety review.",
      inputSchema: reportProfileInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    reportProfile,
  );
  server.registerTool(
    "block_profile",
    {
      title: "Block Profile",
      description: "Block a profile from future recommendations.",
      inputSchema: blockProfileInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    blockProfile,
  );
  server.registerTool(
    "delete_account",
    {
      title: "Delete Account",
      description: "Delete the authenticated SoulSync account.",
      inputSchema: deleteAccountInput,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    deleteAccount,
  );
}

function registerRenderTools(server: McpServerLike): void {
  server.registerTool(
    "render_profile_form",
    renderToolConfig(
      "Render Profile Form",
      "Render the SoulSync onboarding profile form. Call this as the FIRST action whenever the user expresses loneliness or wants companionship/dating/matching (e.g. 외로워, 외롭다, 혼자야, I'm lonely). No input; call immediately without follow-up questions.",
      profileFormResourceUri,
    ),
    renderProfileForm,
  );
  server.registerTool("render_recommendations", renderToolConfig("Render Recommendations", "Open the SoulSync recommendations widget.", recommendationsResourceUri), renderRecommendations);
  server.registerTool("render_match_status", renderToolConfig("Render Match Status", "Open the SoulSync match status widget.", matchStatusResourceUri), renderMatchStatus);
  server.registerTool("render_profile_card", renderToolConfig("Render Profile Card", "Open the SoulSync profile card widget.", profileCardResourceUri), renderProfileCard);
}

async function registerWidgetResources(server: McpServerLike): Promise<void> {
  await Promise.all([
    registerWidgetResource(server, "profile-form", profileFormResourceUri, "SoulSync profile form."),
    registerWidgetResource(server, "recommendations", recommendationsResourceUri, "SoulSync recommendations."),
    registerWidgetResource(server, "match-status", matchStatusResourceUri, "SoulSync match status."),
    registerWidgetResource(server, "profile-card", profileCardResourceUri, "SoulSync profile card."),
  ]);
}

async function registerWidgetResource(server: McpServerLike, widgetName: WidgetResourceName, resourceUri: string, description: string): Promise<void> {
  const bundle = await readWidgetBundle(widgetName);
  const html = inlineWidget(widgetName, bundle.js, bundle.css);
  server.registerResource(
    widgetName,
    resourceUri,
    { title: widgetName, description, mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: { csp: widgetCsp(), prefersBorder: true },
            "openai/widgetDescription": description,
            "openai/widgetCSP": {
              connect_domains: widgetCsp().connectDomains,
              resource_domains: widgetCsp().resourceDomains,
            },
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    }),
  );
}

async function readWidgetBundle(name: WidgetResourceName): Promise<{ js: string; css: string }> {
  const jsPath = new URL(`../../../../../packages/widgets/dist/${name}.es.js`, import.meta.url);
  const cssPath = new URL(`../../../../../packages/widgets/dist/${name}.css`, import.meta.url);
  const [js, css] = await Promise.all([readFile(jsPath, "utf8"), readFile(cssPath, "utf8")]);

  return { js, css };
}

function renderToolConfig(title: string, description: string, resourceUri: string): ToolConfig {
  return {
    title,
    description,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri }, "openai/outputTemplate": resourceUri },
  };
}

function widgetCsp(): { connectDomains: string[]; resourceDomains: string[] } {
  const origin = process.env.OAUTH_AUDIENCE ? new URL(process.env.OAUTH_AUDIENCE).origin : "http://localhost:3000";
  const supabaseOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : undefined;
  const connectDomains = [origin, supabaseOrigin].filter((domain): domain is string => Boolean(domain));

  return { connectDomains, resourceDomains: connectDomains };
}

type ToolConfig = {
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodType>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
  _meta?: Record<string, unknown>;
};

type McpServerLike = Parameters<Parameters<typeof createMcpHandler>[0]>[0];
