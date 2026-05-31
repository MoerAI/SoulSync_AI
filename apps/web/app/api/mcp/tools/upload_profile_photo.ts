import { uploadProfilePhoto as uploadProfilePhotoService, type UploadedPhotoBytes } from "@soulsync/core/src/services/photoService";
import type { PhotoClassifier } from "@soulsync/core/src/safety/moderation";
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
  const source = await readUploadedFile(input.file.file_id);
  const result = await uploadProfilePhotoService(
    {
      fileName: input.file.file_name ?? `${input.file.file_id}.bin`,
      source,
      classifier: defaultPhotoClassifier,
      rejectedPhotoId: input.file.file_id,
    },
    { client: getServiceSupabase(), actor },
  ).catch(() => null);

  if (!result) {
    rowError("Unable to save profile photo");
  }

  if (result.status === "rejected") {
    return ok(serializePhotoUpload({ photoId: result.photoId, status: result.status }), "Profile photo rejected by moderation.", {
      photo: { status: result.status, reasons: result.reasons ?? [] },
    });
  }

  return ok(serializePhotoUpload({ photoId: result.photoId, status: result.status }), "Profile photo uploaded.", { photo: { id: result.photoId, status: result.status } });
}

const defaultPhotoClassifier: PhotoClassifier = {
  async classify(input) {
    const marker = new TextDecoder().decode(input.buffer.slice(0, Math.min(input.buffer.byteLength, 4096)));

    return { nsfw: marker.includes("SOULSYNC_REJECT_PHOTO"), apparentMinor: false };
  },
};

async function readUploadedFile(fileId: string): Promise<UploadedPhotoBytes> {
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

function readDataUrl(value: string): UploadedPhotoBytes {
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
