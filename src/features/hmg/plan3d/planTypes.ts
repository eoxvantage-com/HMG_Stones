import type { HmgPlanRoomCategory, HmgReviewedPlan, HmgReviewedPlanRoom } from "../types";

export const PLAN_UPLOAD_BUCKET = "hmg-project-plans" as const;
export const PLAN_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const PLAN_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type { HmgPlanRoomCategory, HmgReviewedPlan, HmgReviewedPlanRoom };
