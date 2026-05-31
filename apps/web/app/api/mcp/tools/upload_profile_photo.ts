import { moderatePhoto, stripExif, type PhotoClassifier } from "@soulsync/core/src/safety/moderation";
import { serializePhotoUpload } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const uploadProfilePhotoInput = {
  file: z.object({
    file_id: z.string().min(1),
    file_name: z.string().optional(),
  }).strict(),
};

export async function uploadProfilePhoto(input: { file: { file_id: string; file_name?: string } }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const fileName = sanitizeFileName(input.file.file_name ?? `${input.file.file_id}.bin`);
  const path = `${actor.appUserId}/${Date.now()}-${fileName}`;
  const supabase = getServiceSupabase();
  const source = await readUploadedFile(input.file.file_id);
  const stripped = stripExif(source.buffer);
  const moderation = await moderatePhoto({ buffer: stripped, mimeType: source.mimeType, byteLength: stripped.byteLength }, defaultPhotoClassifier);

  if (moderation.status === "rejected") {
    return ok(serializePhotoUpload({ photoId: input.file.file_id, status: "rejected" }), "Profile photo rejected by moderation.", {
      photo: { status: moderation.status, reasons: moderation.reasons },
    });
  }

  const { error: uploadError } = await supabase.storage.from("profile-private").upload(path, moderation.buffer, {
    contentType: moderation.mimeType,
    upsert: false,
  });
  if (uploadError) {
    rowError("Unable to upload profile photo");
  }

  const { data, error } = await supabase.from("photos").insert({ app_user_id: actor.appUserId, bucket: "profile-private", path, moderation_status: moderation.status, is_primary: false }).select("id").single<{ id: string }>();
  if (error || !data) {
    rowError("Unable to save profile photo");
  }

  return ok(serializePhotoUpload({ photoId: data.id, status: moderation.status }), "Profile photo uploaded.", { photo: { id: data.id, status: moderation.status } });
}

type UploadedFileBytes = {
  buffer: Uint8Array;
  mimeType: string;
};

const defaultPhotoClassifier: PhotoClassifier = {
  async classify(input) {
    const marker = new TextDecoder().decode(input.buffer.slice(0, Math.min(input.buffer.byteLength, 4096)));

    return { nsfw: marker.includes("SOULSYNC_REJECT_PHOTO"), apparentMinor: false };
  },
};

async function readUploadedFile(fileId: string): Promise<UploadedFileBytes> {
  if (fileId.startsWith("data:")) {
    return readDataUrl(fileId);
  }

  const url = fileId.startsWith("http://") || fileId.startsWith("https://") ? fileId : undefined;
  const openAiKey = process.env.OPENAI_API_KEY;
  const requestUrl = url ?? (openAiKey ? `https://api.openai.com/v1/files/${encodeURIComponent(fileId)}/content` : undefined);
  if (!requestUrl) {
    rowError("Unable to read uploaded profile photo");
  }

  const response = await fetch(requestUrl, openAiKey && !url ? { headers: { Authorization: `Bearer ${openAiKey}` } } : undefined);
  if (!response.ok) {
    rowError("Unable to download profile photo");
  }

  return {
    buffer: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type")?.split(";")[0] ?? mimeTypeFromName(fileId),
  };
}

function readDataUrl(value: string): UploadedFileBytes {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(value);
  if (!match) {
    rowError("Unable to read uploaded profile photo");
  }

  const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  return { buffer: Uint8Array.from(raw, (char) => char.charCodeAt(0)), mimeType: match[1] };
}

function mimeTypeFromName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}
