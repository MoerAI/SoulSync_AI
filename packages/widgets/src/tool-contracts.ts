export type WidgetToolCallSample = {
  widget: "profile-form" | "recommendations" | "match-status";
  name: string;
  args: Record<string, unknown>;
};

export const widgetToolCallSamples = [
  { widget: "profile-form", name: "save_profile_step", args: { step: "age_gate", data: { birthYear: "1995" } } },
  { widget: "profile-form", name: "save_profile_consent", args: { consents: [{ scope: "terms", granted: true }], version: "2026-05-31" } },
  { widget: "profile-form", name: "generate_persona", args: {} },
  { widget: "profile-form", name: "update_persona", args: { edits: { displayName: "SoulSync" } } },
  { widget: "profile-form", name: "upload_profile_photo", args: { file: { file_id: "file-123", file_name: "profile.jpg" } } },
  { widget: "profile-form", name: "start_match_job", args: {} },
  { widget: "recommendations", name: "list_recommendations", args: {} },
  { widget: "recommendations", name: "save_recommendation", args: { recommendationId: "rec-123" } },
  { widget: "recommendations", name: "report_profile", args: { candidateId: "candidate-123", reason: "inappropriate" } },
  { widget: "recommendations", name: "block_profile", args: { candidateId: "candidate-123" } },
  { widget: "match-status", name: "get_match_job", args: { jobId: "job-123" } },
  { widget: "match-status", name: "start_match_job", args: {} },
] as const satisfies readonly WidgetToolCallSample[];
