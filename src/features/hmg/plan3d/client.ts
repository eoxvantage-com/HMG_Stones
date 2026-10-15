import { taruviClient } from "../../../taruviClient";
import { workflow, unwrapResult } from "../api";
import type { CommandResult, HmgPlanExtractionDraft, HmgProject, HmgVisualPreview } from "../types";
import { PLAN_UPLOAD_BUCKET } from "./planTypes";
export { buildPlanUploadMetadata, isSupportedPlanFile } from "./uploadMetadata";
import { buildPlanUploadMetadata } from "./uploadMetadata";

export async function uploadPlanFile(project: HmgProject, file: File, uploadId = crypto.randomUUID()): Promise<HmgProject> {
  const meta = buildPlanUploadMetadata(project.id, uploadId, file);
  await taruviClient.storage.from(PLAN_UPLOAD_BUCKET).upload({
    files: [file],
    paths: [meta.storagePath],
    metadatas: [{ projectId: project.id, uploadId, purpose: "plan-to-3d" }],
  }).execute();
  return workflow<HmgProject>({
    command: "createPlanUpload",
    projectId: project.id,
    expectedVersion: project.version,
    idempotencyKey: uploadId,
    payload: { ...meta },
  });
}

export async function extractPlanDimensions(projectId: string, uploadId: string): Promise<HmgPlanExtractionDraft> {
  const response = await taruviClient.functions.execute<CommandResult<HmgPlanExtractionDraft>>(
    "hmg-extract-plan-dimensions",
    { async: false, params: { projectId, uploadId } },
  );
  if (response?.status !== "success" || !response.data) throw new Error("Plan extraction did not return a usable response.");
  if (!response.data.ok) {
    const error = response.data.error;
    throw Object.assign(new Error(error?.message || "Plan extraction failed. Your upload is retained."), {
      code: error?.code,
      stage: error?.stage,
      detail: error?.detail,
    });
  }
  return unwrapResult(response.data);
}

export async function generatePlanVisualPreview(projectId: string, uploadId: string): Promise<HmgVisualPreview> {
  const response = await taruviClient.functions.execute<CommandResult<HmgVisualPreview>>(
    "hmg-plan-visual-preview",
    { async: false, params: { projectId, uploadId } },
  );
  if (response?.status !== "success" || !response.data) throw new Error("Diffusers visual preview did not return a usable response.");
  if (!response.data.ok) {
    const error = response.data.error;
    throw Object.assign(new Error(error?.message || "Diffusers visual preview failed."), {
      code: error?.code,
      stage: error?.stage,
      detail: error?.detail,
    });
  }
  return unwrapResult(response.data);
}

export async function requestPlanVisualPreviewUrl(preview: HmgVisualPreview, signal?: AbortSignal): Promise<string> {
  const blob = await taruviClient.storage.from(preview.storageBucket).download(preview.storagePath).execute<Blob>();
  if (!(blob instanceof Blob) || !["image/png", "image/jpeg", "image/webp"].includes(blob.type.toLowerCase())) {
    throw new Error("The private visual preview has an unsupported image format.");
  }
  if (signal?.aborted) throw new DOMException("Image request aborted.", "AbortError");
  const url = URL.createObjectURL(blob);
  if (signal) signal.addEventListener("abort", () => URL.revokeObjectURL(url), { once: true });
  return url;
}
