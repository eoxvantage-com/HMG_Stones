import { taruviClient } from "../../../taruviClient";
import { workflow, unwrapResult } from "../api";
import type { CommandResult, HmgPlanExtractionDraft, HmgProject } from "../types";
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
  return unwrapResult(response.data);
}
