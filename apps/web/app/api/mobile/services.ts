import { getMatchJob, startMatchJob } from "@soulsync/core/src/services/matchService";
import { generatePersonaForActor, updatePersonaForActor } from "@soulsync/core/src/services/personaService";
import { createProfilePhotoUpload } from "@soulsync/core/src/services/photoService";
import { saveProfileStep } from "@soulsync/core/src/services/profileService";
import { listRecommendations } from "@soulsync/core/src/services/recommendationService";
import { blockProfile, deleteAccount, reportProfile } from "@soulsync/core/src/services/safetyService";
import { serializeBlock, serializeDeleteAccount, serializeMatchJob, serializePersona, serializePhotoUpload, serializeProfileStep, serializeReport } from "@soulsync/core/src/serializers";
import type { McpActor } from "@soulsync/core/src/identity/index";
import type { PersonaConsent, PersonaTalkingPoints } from "@soulsync/core/src/persona/index";
import type { PersonaSpec } from "@soulsync/core/src/types/index";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceClient = SupabaseClient;

export const saveMobileProfileStep = async (actor: McpActor, input: { step: string; data: Record<string, unknown> }, client: ServiceClient): Promise<Record<string, unknown>> => serializeProfileStep(await saveProfileStep(input, { client, actor }));

export const generateMobilePersona = async (actor: McpActor, input: { consent?: PersonaConsent }, client: ServiceClient): Promise<Record<string, unknown>> => ({ persona: serializePersona(await generatePersonaForActor(input, { client, actor })) });

export const updateMobilePersona = async (actor: McpActor, input: { updates: Partial<PersonaSpec> & Partial<PersonaTalkingPoints> }, client: ServiceClient): Promise<Record<string, unknown>> => ({ persona: serializePersona(await updatePersonaForActor(input, { client, actor })) });

export const createMobilePhotoUpload = async (actor: McpActor, input: { fileName: string }, client: ServiceClient): Promise<Record<string, unknown>> => {
  const result = await createProfilePhotoUpload(input, { client, actor });

  return { ...serializePhotoUpload({ photoId: result.photoId, status: result.status }), upload: result.upload };
};

export const enqueueMobileMatchJob = async (actor: McpActor, client: ServiceClient): Promise<Record<string, unknown>> => serializeMatchJob(await startMatchJob({ client, actor }));

export const getMobileMatchJob = async (actor: McpActor, jobId: string, client: ServiceClient): Promise<Record<string, unknown>> => serializeMatchJob(await getMatchJob({ jobId }, { client, actor }));

export const listMobileRecommendations = async (actor: McpActor, input: { jobId?: string; limit?: number }, client: ServiceClient): Promise<Record<string, unknown>> => (await listRecommendations({ ...input, includePhotoUrls: false }, { client, actor })).serialized;

export const reportMobileProfile = async (actor: McpActor, input: { profileId: string; reason: string }, client: ServiceClient): Promise<Record<string, unknown>> => serializeReport(await reportProfile(input, { client, actor }));

export const blockMobileProfile = async (actor: McpActor, input: { profileId: string }, client: ServiceClient): Promise<Record<string, unknown>> => serializeBlock(await blockProfile(input, { client, actor }));

export const deleteMobileAccount = async (actor: McpActor, client: ServiceClient): Promise<Record<string, unknown>> => {
  await deleteAccount({ client, actor });

  return serializeDeleteAccount();
};
