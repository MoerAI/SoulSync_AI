import { z } from "zod";

import { blockProfileInput } from "./block_profile";
import { deleteAccountInput } from "./delete_account";
import { generatePersonaInput } from "./generate_persona";
import { getMatchJobInput } from "./get_match_job";
import { listRecommendationsInput } from "./list_recommendations";
import { reportProfileInput } from "./report_profile";
import { saveProfileConsentInput } from "./save_profile_consent";
import { saveProfileStepInput } from "./save_profile_step";
import { saveRecommendationInput } from "./save_recommendation";
import { startMatchJobInput } from "./start_match_job";
import { updatePersonaInput } from "./update_persona";
import { uploadProfilePhotoInput } from "./upload_profile_photo";

export type ToolInputShape = Record<string, z.ZodType>;

export const dataToolInputSchemas = {
  save_profile_step: saveProfileStepInput,
  save_profile_consent: saveProfileConsentInput,
  generate_persona: generatePersonaInput,
  update_persona: updatePersonaInput,
  upload_profile_photo: uploadProfilePhotoInput,
  start_match_job: startMatchJobInput,
  get_match_job: getMatchJobInput,
  list_recommendations: listRecommendationsInput,
  save_recommendation: saveRecommendationInput,
  report_profile: reportProfileInput,
  block_profile: blockProfileInput,
  delete_account: deleteAccountInput,
} as const satisfies Record<string, ToolInputShape>;

export type RegisteredDataToolName = keyof typeof dataToolInputSchemas;

export function schemaForTool(name: RegisteredDataToolName): z.ZodObject<ToolInputShape> {
  return z.object(dataToolInputSchemas[name]).strict();
}
