import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, stringValue, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const uploadProfilePhotoInput = {
  file: z.object({
    file_id: z.string().min(1),
    download_url: z.string().url().optional(),
    mime_type: z.string().optional(),
    file_name: z.string().optional(),
  }),
  idempotencyKey: z.string().min(1).optional(),
};

export async function uploadProfilePhoto(input: { file: { file_id: string; download_url?: string; mime_type?: string; file_name?: string }; idempotencyKey?: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const fileName = sanitizeFileName(input.file.file_name ?? `${input.file.file_id}.bin`);
  const path = `${actor.appUserId}/${Date.now()}-${fileName}`;
  const supabase = getServiceSupabase();

  if (input.file.download_url) {
    const download = await fetch(input.file.download_url);
    if (!download.ok) {
      rowError("Unable to download profile photo");
    }
    const { error: uploadError } = await supabase.storage.from("profile-private").upload(path, await download.arrayBuffer(), {
      contentType: stringValue(input.file.mime_type) ?? "application/octet-stream",
      upsert: false,
    });
    if (uploadError) {
      rowError("Unable to upload profile photo");
    }
  }

  const { data, error } = await supabase.from("photos").insert({ app_user_id: actor.appUserId, bucket: "profile-private", path, moderation_status: "pending", is_primary: false }).select("id").single<{ id: string }>();
  if (error || !data) {
    rowError("Unable to save profile photo");
  }

  return ok({ photoId: data.id, status: "pending" }, "Profile photo uploaded.", { photo: { id: data.id, bucket: "profile-private", path } });
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}
