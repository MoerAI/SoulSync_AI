import { moderatePhoto, type PhotoClassifier, type PhotoModerationReason } from "../safety/moderation";
import type { CoreServiceContext } from "./types";

export type UploadedPhotoBytes = { buffer: Uint8Array; mimeType: string };
export type ModeratedPhotoUploadResult = { photoId: string; status: "approved" | "rejected"; reasons?: PhotoModerationReason[] };
export type SignedPhotoUploadResult = { photoId: string; status: "pending"; upload: { url: string | null; path: string; token: string | null } };

export const uploadProfilePhoto = async (input: { fileName: string; source: UploadedPhotoBytes; classifier: PhotoClassifier; rejectedPhotoId?: string }, { client, actor }: CoreServiceContext): Promise<ModeratedPhotoUploadResult> => {
  const fileName = sanitizeFileName(input.fileName || "profile-photo.bin");
  const path = `${actor.appUserId}/${Date.now()}-${fileName}`;
  const moderation = await moderatePhoto({ buffer: input.source.buffer, mimeType: input.source.mimeType, byteLength: input.source.buffer.byteLength }, input.classifier);

  if (moderation.status === "rejected") {
    return { photoId: input.rejectedPhotoId ?? fileName, status: moderation.status, reasons: moderation.reasons };
  }

  const { error: uploadError } = await client.storage.from("profile-private").upload(path, moderation.buffer, {
    contentType: moderation.mimeType,
    upsert: false,
  });
  if (uploadError) {
    throw new Error("Unable to upload profile photo");
  }

  const { data, error } = await client.from("photos").insert({ app_user_id: actor.appUserId, bucket: "profile-private", path, moderation_status: moderation.status, is_primary: false }).select("id").single<{ id: string }>();
  if (error || !data) {
    throw new Error("Unable to save profile photo");
  }

  return { photoId: data.id, status: moderation.status };
};

export const createProfilePhotoUpload = async (input: { fileName: string }, { client, actor }: CoreServiceContext): Promise<SignedPhotoUploadResult> => {
  const fileName = sanitizeFileName(input.fileName || "profile-photo.bin");
  const path = `${actor.appUserId}/${Date.now()}-${fileName}`;
  const signed = await client.storage.from("profile-private").createSignedUploadUrl(path);
  if (signed.error) {
    throw new Error("Unable to create signed photo upload");
  }

  const { data, error } = await client.from("photos").insert({ app_user_id: actor.appUserId, bucket: "profile-private", path, moderation_status: "pending", is_primary: false }).select("id").single<{ id: string }>();
  if (error || !data) {
    throw new Error("Unable to save profile photo");
  }

  return { photoId: data.id, status: "pending", upload: { url: signed.data?.signedUrl ?? null, path: signed.data?.path ?? path, token: signed.data?.token ?? null } };
};

const sanitizeFileName = (fileName: string): string => fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
