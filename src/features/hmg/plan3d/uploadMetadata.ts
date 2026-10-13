import { PLAN_UPLOAD_BUCKET, PLAN_UPLOAD_MAX_BYTES, PLAN_UPLOAD_MIME_TYPES } from "./planTypes";

const SAFE_PLAN_FILE = /^[A-Za-z0-9._ -]{1,180}\.(?:pdf|png|jpe?g|webp)$/i;
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

export interface PlanUploadMetadata {
  uploadId: string;
  fileName: string;
  storageBucket: typeof PLAN_UPLOAD_BUCKET;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

export function isSupportedPlanFile(file: Pick<File, "name" | "type" | "size">): boolean {
  return (
    SAFE_PLAN_FILE.test(file.name) &&
    !file.name.includes("..") &&
    PLAN_UPLOAD_MIME_TYPES.includes(file.type as (typeof PLAN_UPLOAD_MIME_TYPES)[number]) &&
    file.size > 0 &&
    file.size <= PLAN_UPLOAD_MAX_BYTES
  );
}

export function buildPlanUploadMetadata(
  projectId: string,
  uploadId: string,
  file: Pick<File, "name" | "type" | "size">,
): PlanUploadMetadata {
  if (!SAFE_ID.test(projectId) || !SAFE_ID.test(uploadId)) throw new Error("Invalid plan upload target.");
  if (!isSupportedPlanFile(file)) throw new Error("Upload a PDF, PNG, JPG, or WebP plan under 20 MB.");
  return {
    uploadId,
    fileName: file.name,
    storageBucket: PLAN_UPLOAD_BUCKET,
    storagePath: `projects/${projectId}/plans/${uploadId}/${file.name}`,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}
