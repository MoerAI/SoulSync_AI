import type { FunnelCandidate } from "../scoring/funnel";

export type EnforcementQuery<T = Record<string, unknown>> = PromiseLike<{ data: T[]; error: unknown }> & {
  select: (columns?: string) => EnforcementQuery<T>;
  eq: (column: string, value: unknown) => EnforcementQuery<T>;
  insert: (value: Record<string, unknown> | Record<string, unknown>[]) => EnforcementQuery<T>;
  upsert?: (value: Record<string, unknown> | Record<string, unknown>[], options?: Record<string, unknown>) => EnforcementQuery<T>;
  update: (value: Record<string, unknown>) => EnforcementQuery<T>;
  delete: () => EnforcementQuery<T>;
  single?: () => Promise<{ data: T | null; error: unknown }>;
};

export type EnforcementClient = {
  from: <T = Record<string, unknown>>(table: string) => EnforcementQuery<T>;
};

export type BlockRow = {
  id?: string;
  blocker_id: string;
  blocked_id: string;
};

export type ReportRow = {
  id?: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
};

export type ConsentInput = {
  appUserId: string;
  scope: string;
  version: string;
  granted: boolean;
  locale: string;
  source: string;
};

export const blockProfile = async ({ blockerId, blockedId }: { blockerId: string; blockedId: string }, client: EnforcementClient): Promise<{ id: string }> => {
  if (blockerId === blockedId) {
    throw new Error("Cannot block your own profile");
  }

  const query = client.from("blocks");
  const write = query.upsert
    ? query.upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" })
    : query.insert({ blocker_id: blockerId, blocked_id: blockedId });
  const result = await selectSingle(write.select("id"));

  if (result.error || !result.data?.id) {
    throw new Error("Unable to block profile");
  }

  return { id: String(result.data.id) };
};

export const reportProfile = async ({ reporterId, reportedId, reason }: { reporterId: string; reportedId: string; reason: string }, client: EnforcementClient): Promise<{ id: string }> => {
  const result = await selectSingle(client.from("reports").insert({ reporter_id: reporterId, reported_id: reportedId, reason }).select("id"));

  if (result.error || !result.data?.id) {
    throw new Error("Unable to report profile");
  }

  return { id: String(result.data.id) };
};

export const writeConsent = async (input: ConsentInput, client: EnforcementClient): Promise<{ id: string }> => {
  const result = await selectSingle(
    client
      .from("consents")
      .insert({ app_user_id: input.appUserId, scope: input.scope, granted: input.granted, version: input.version, locale: input.locale, source: input.source })
      .select("id"),
  );

  if (result.error || !result.data?.id) {
    throw new Error("Unable to write consent ledger entry");
  }

  return { id: String(result.data.id) };
};

export const withdrawConsent = async (input: Omit<ConsentInput, "granted">, client: EnforcementClient): Promise<{ id: string }> => writeConsent({ ...input, granted: false }, client);

export const excludeBlockedCandidates = <Candidate extends Pick<FunnelCandidate, "id">>(actorId: string, candidates: readonly Candidate[], blocks: readonly Pick<BlockRow, "blocker_id" | "blocked_id">[]): Candidate[] =>
  candidates.filter((candidate) => !blocks.some((block) => (block.blocker_id === actorId && block.blocked_id === candidate.id) || (block.blocked_id === actorId && block.blocker_id === candidate.id)));

export const deleteAccount = async (appUserId: string, client: EnforcementClient): Promise<void> => {
  const profileRows = (await client.from<{ id: string }>("profiles").select("id").eq("app_user_id", appUserId)).data ?? [];
  const profileIds = profileRows.map((row) => row.id);

  await requireOk(client.from("profiles").update({ visibility: "private" }).eq("app_user_id", appUserId), "Unable to hide profile from discovery");

  for (const profileId of profileIds) {
    await requireOk(client.from("profile_embeddings").delete().eq("profile_id", profileId), "Unable to delete profile embeddings");
  }

  for (const table of ["photos", "profile_answers", "consents", "match_jobs", "external_identities"] as const) {
    await requireOk(client.from(table).delete().eq("app_user_id", appUserId), `Unable to delete ${table}`);
  }

  await deleteBidirectional(client, "blocks", "blocker_id", "blocked_id", appUserId);
  await deleteBidirectional(client, "reports", "reporter_id", "reported_id", appUserId);
  await deleteBidirectional(client, "match_simulations", "user_a", "user_b", appUserId);
  await deleteBidirectional(client, "recommendations", "app_user_id", "candidate_id", appUserId);
  await requireOk(client.from("profiles").delete().eq("app_user_id", appUserId), "Unable to delete profile");
  await requireOk(client.from("app_users").delete().eq("id", appUserId), "Unable to delete app user");
};

const deleteBidirectional = async (client: EnforcementClient, table: string, leftColumn: string, rightColumn: string, appUserId: string): Promise<void> => {
  await requireOk(client.from(table).delete().eq(leftColumn, appUserId), `Unable to delete ${table}`);
  await requireOk(client.from(table).delete().eq(rightColumn, appUserId), `Unable to delete ${table}`);
};

const selectSingle = async <T extends Record<string, unknown>>(query: EnforcementQuery<T>): Promise<{ data: T | null; error: unknown }> => {
  if (query.single) {
    return query.single();
  }

  const result = await query;
  return { data: result.data[0] ?? null, error: result.error };
};

const requireOk = async (query: EnforcementQuery, message: string): Promise<void> => {
  const result = await query;

  if (result.error) {
    throw new Error(message);
  }
};
