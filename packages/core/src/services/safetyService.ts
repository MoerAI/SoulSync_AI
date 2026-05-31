import { blockProfile as blockCoreProfile, deleteAccount as deleteCoreAccount, reportProfile as reportCoreProfile } from "../safety/enforcement";
import type { CoreServiceContext } from "./types";
import { asEnforcementClient } from "./types";

export const reportProfile = async (input: { profileId: string; reason?: string }, { client, actor }: CoreServiceContext): Promise<{ reportId: string }> => ({
  reportId: (await reportCoreProfile({ reporterId: actor.appUserId, reportedId: input.profileId, reason: input.reason ?? "profile_report" }, asEnforcementClient(client))).id,
});

export const blockProfile = async (input: { profileId: string }, { client, actor }: CoreServiceContext): Promise<{ blockId: string; blockedProfileId: string }> => ({
  blockId: (await blockCoreProfile({ blockerId: actor.appUserId, blockedId: input.profileId }, asEnforcementClient(client))).id,
  blockedProfileId: input.profileId,
});

export const deleteAccount = async ({ client, actor }: CoreServiceContext): Promise<{ deleted: true }> => {
  await deleteCoreAccount(actor.appUserId, asEnforcementClient(client));

  return { deleted: true };
};
