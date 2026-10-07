import { useCustom, useNotification, useOnError } from "@refinedev/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { taruviClient } from "../../taruviClient";
import type { CommandEnvelope, CommandResult, HmgProject } from "./types";
import {
  prepareCommand,
  authorizeConflictRebase,
  type PendingCommand,
} from "./pendingCommand";

export function unwrapResult<T>(result: CommandResult<T>): T {
  if (!result?.ok || result.data === undefined)
    throw Object.assign(
      new Error(
        result?.error?.code === "CONFLICT"
          ? "This project changed elsewhere. Review changes before saving. Your edits are retained."
          : result?.error?.message ||
            "The server did not confirm this operation."
      ),
      {
        code: result?.error?.code,
        currentVersion: result?.error?.currentVersion,
      }
    );
  return result.data;
}
export const hasHmgSession = () => !!taruviClient.tokenClient.getSessionToken();
function transportError(error: unknown): never {
  const status = (error as {statusCode?: number})?.statusCode;
  if (status && [401, 410, 419].includes(status)) {
    taruviClient.tokenClient.clearTokens();
    throw Object.assign(new Error("Your Taruvi session is missing or expired. Sign in again."), {statusCode: 401});
  }
  if (status === 403) throw Object.assign(new Error("Your account does not have permission for this HMG operation."), {statusCode: 403});
  throw error;
}
export async function workflow<T>(input: CommandEnvelope): Promise<T> {
  if (!hasHmgSession()) throw Object.assign(new Error("Sign in to your Taruvi account before opening the HMG workspace."), {statusCode: 401});
  try {
    // The nonpublic function derives its actor from Taruvi user_data, never browser claims.
    const response = await taruviClient.functions.execute<CommandResult<T>>("hmg-native-workflow", {async: false, params: {...input}});
    if (response?.status !== "success" || !response.data)
      throw new Error("Taruvi did not confirm this operation. Your edits are retained.");
    return unwrapResult(response.data);
  } catch (error) { return transportError(error); }
}

export async function catalogue<T>(payload: Record<string, unknown>): Promise<T> {
  const {id, search = "", tone = "", page = 1, pageSize = 12} = payload;
  const raw = await workflow<Record<string, unknown>>({
    command: id ? "getOption" : "listOptions",
    payload: id ? {optionId: id} : {search, tone, page, pageSize},
  });
  const project = (value: unknown) => {
    const option = value as Record<string, unknown>;
    if (!option || typeof option.id !== "string" || typeof option.title !== "string") throw new Error("Invalid catalogue option.");
    return Object.fromEntries([["data", {}], ...["id", "title", "tone", "movement", "application", "status"].map(key => [key, typeof option[key] === "string" ? option[key].slice(0, 500) : "Unknown"])]);
  };
  if (id) return project(raw) as T;
  if (!Array.isArray(raw.data) || raw.data.length > Number(pageSize) || !Number.isSafeInteger(raw.total) || Number(raw.total) < 0)
    throw new Error("Invalid catalogue list.");
  return {data: raw.data.map(project), total: raw.total, page, pageSize} as T;
}

const abortError = () => new DOMException("Image request aborted.", "AbortError");
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
/** SDK 1.5.3 cannot cancel its HTTP request. Reject promptly and discard late results. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, {once: true});
    promise.then(value => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(abortError()); else resolve(value);
    }, error => { signal.removeEventListener("abort", abort); reject(signal.aborted ? abortError() : error); });
    if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
  });
}
export async function requestPrivateImageBlob(assetId: string, signal?: AbortSignal): Promise<Blob> {
  checkAbort(signal);
  if (!/^hmg-(?:gallery-\d{3}|stone-[a-z0-9_-]{1,80})$/.test(assetId))
    throw new Error("Choose an approved HMG image reference.");
  const object = await abortable(workflow<{bucket: string; path: string}>({command: "getImageObject", payload: {assetId}}), signal);
  checkAbort(signal);
  const prefix = assetId.startsWith("hmg-gallery-") ? "gallery/" : "materials/";
  if (!object || object.bucket !== "hmg-gallery" || typeof object.path !== "string" ||
      !object.path.startsWith(prefix) || !/^(?:gallery|materials)\/[A-Za-z0-9_-]{1,180}\.(?:jpe?g|png|webp)$/i.test(object.path))
    throw new Error("The private HMG image service returned an invalid object.");
  if (!hasHmgSession()) throw Object.assign(new Error("Sign in to view private HMG images."), {statusCode: 401});
  let blob: Blob;
  try { blob = await abortable(taruviClient.storage.from("hmg-gallery").download(object.path).execute<Blob>(), signal); }
  catch (error) { return transportError(error); }
  checkAbort(signal);
  if (!(blob instanceof Blob) || blob.size < 12 || blob.size > 8 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(blob.type.toLowerCase()))
    throw new Error("The private HMG image has an unsupported format or size.");
  const bytes = new Uint8Array(await abortable(blob.slice(0, 12).arrayBuffer(), signal));
  const matches = blob.type.toLowerCase() === "image/jpeg"
    ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : blob.type.toLowerCase() === "image/png"
      ? [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)
      : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!matches) throw new Error("The private HMG image signature does not match its format.");
  checkAbort(signal);
  return blob;
}
/** Consumers supplying a signal own URL lifetime through abort; otherwise revoke manually. */
export async function requestPrivateImageUrl(assetId: string, signal?: AbortSignal): Promise<string> {
  const blob = await requestPrivateImageBlob(assetId, signal);
  checkAbort(signal);
  const url = URL.createObjectURL(blob);
  if (signal) {
    const revoke = () => URL.revokeObjectURL(url);
    signal.addEventListener("abort", revoke, {once: true});
    if (signal.aborted) { signal.removeEventListener("abort", revoke); revoke(); throw abortError(); }
  }
  return url;
}
export function useWorkflow<T>(
  command: string,
  projectId?: string,
  payload?: Record<string, unknown>,
  enabled = true
) {
  const signature = JSON.stringify(payload || {});
  const envelope = useMemo(
    () => ({
      command,
      ...(projectId ? { projectId } : {}),
      payload: JSON.parse(signature),
    }),
    [command, projectId, signature]
  );
  const hook = useCustom({
    url: "hmg-native-workflow",
    method: "post",
    dataProviderName: "app",
    config: { payload: envelope },
    meta: { kind: "function" },
    queryOptions: {
      enabled: enabled && hasHmgSession(),
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 3000,
      refetchInterval: (query) =>
        query.state.error
          ? false
          : [
              "getProject", "getChange",
              "getSalesProject",
              "getProposal",
              "listProjects", "listQuotes", "listQuoteCandidates", "getDesignDashboard",
              "overview",
            ].includes(command)
          ? 4000
          : false,
      refetchIntervalInBackground: false,
      queryKey: ["hmg", command, projectId, signature],
      queryFn: async () => ({ data: { value: await workflow<T>(envelope) } }),
    },
    errorNotification: false,
  });
  return {
    data: hook.result?.data?.value as T | undefined,
    loading: hook.query.isLoading,
    fetching: hook.query.isFetching,
    error: hook.query.error,
    refetch: hook.query.refetch,
    refreshValue: async (): Promise<T> => {
      const next = await hook.query.refetch();
      if (next.error || !next.data?.data?.value)
        throw next.error || new Error("Latest revision could not be loaded.");
      return next.data.data.value as T;
    },
    updatedAt: hook.query.dataUpdatedAt,
  };
}
export function useProjectCommand(
  project: HmgProject | undefined,
  refresh: () => unknown
) {
  const [busy, setBusy] = useState(false);
  const [failureArmed, setFailureArmed] = useState(false);
  const armed = useRef(false);
  const armFailure = () => { if (!lock.current) { armed.current=true; setFailureArmed(true); } };
  const cancelFailure = () => { armed.current=false; setFailureArmed(false); };
  const [error, setError] = useState("");
  const [conflictVersion, setConflictVersion] = useState<number>();
  const failureCode = useRef<string>();
  const { open } = useNotification();
  const { mutate: checkAuthError } = useOnError();
  const lock = useRef(false);
  const pending = useRef<PendingCommand>();
  useEffect(() => { armed.current=false;setFailureArmed(false); }, [project?.id]);
  const rebase = (reviewedVersion: number) => {
    if (lock.current)
      throw new Error(
        "A request is in progress. Wait for its confirmed result before reviewing a conflict."
      );
    if (pending.current && JSON.parse(pending.current.signature).projectId !== project?.id)
      throw new Error("This conflict belongs to another project. Review that project before retrying.");
    const version = authorizeConflictRebase(
      pending.current,
      failureCode.current,
      reviewedVersion,
      project?.version || 0
    );
    pending.current = undefined;
    failureCode.current = undefined;
    setConflictVersion(undefined);
    setError("");
    return version;
  };
  const run = async (
    command: string,
    payload: Record<string, unknown> = {},
    baseVersion?: number
  ) => {
    if (!project || lock.current)
      throw new Error("Please wait until the current operation completes.");
    const signature = JSON.stringify({
      command,
      payload,
      projectId: project.id,
    });
    pending.current = prepareCommand(
      pending.current,
      signature,
      baseVersion ?? project.version,
      () => crypto.randomUUID()
    );
    lock.current = true;
    setBusy(true);
    setError("");
    failureCode.current = undefined;
    setConflictVersion(undefined);
    try {
      const result = await workflow<HmgProject>({
        command,
        projectId: project.id,
        expectedVersion: pending.current.version,
        idempotencyKey: pending.current.key,
        payload: armed.current ? {...payload,failBeforeCommit:true} : payload,
      });
      cancelFailure();
      pending.current = undefined;
      failureCode.current = undefined;
      setConflictVersion(undefined);
      await refresh();
      open?.({
        type: "success",
        message:
          command === "createInquiry"
            ? "Advice request saved in demo workspace"
            : "Saved",
        description: "Confirmed by the HMG workspace.",
      });
      return result;
    } catch (e) {
      const failure = e as { code?: string; currentVersion?: number };
      if (failure?.code === "BEFORE_COMMIT") cancelFailure();
      failureCode.current = failure?.code;
      setConflictVersion(
        failure?.code === "CONFLICT"
          ? failure.currentVersion ?? project.version
          : undefined
      );
      if ((e as { statusCode?: number })?.statusCode === 401) checkAuthError(e);
      const message =
        e instanceof Error ? e.message : "Not saved. Please retry.";
      setError(message);
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error, conflictVersion, rebase, armFailure, cancelFailure, failureArmed };
}

export function useCatalogue<T>(payload: Record<string, unknown>, enabled=true) {
 const signature=JSON.stringify(payload);
 const stable=useMemo(()=>JSON.parse(signature),[signature]);
 const hook=useCustom({url:'hmg-native-workflow',method:'post',dataProviderName:'app',config:{payload:stable},queryOptions:{enabled:enabled && hasHmgSession(),retry:false,queryKey:['hmg-catalogue',signature],queryFn:async()=>({data:{value:await catalogue<T>(stable)}})}});
 return {data:hook.result?.data?.value as T|undefined,loading:hook.query.isLoading,error:hook.query.error,refetch:hook.query.refetch};
}
