export interface PendingCommand {
  signature: string;
  key: string;
  version: number;
}
export function prepareCommand(
  pending: PendingCommand | undefined,
  signature: string,
  version: number,
  key: () => string
): PendingCommand {
  return pending?.signature === signature
    ? pending
    : { signature, version, key: key() };
}
/** Call only from a user's explicit reviewed-conflict action; never from polling or retry. */
export function authorizeConflictRebase(
  pending: PendingCommand | undefined,
  failureCode: string | undefined,
  reviewedVersion: number,
  currentVersion: number
): number {
  if (!pending || failureCode !== "CONFLICT")
    throw new Error(
      "Only a confirmed conflict may be rebased. Uncertain requests retain their original key."
    );
  if (
    !Number.isSafeInteger(reviewedVersion) ||
    reviewedVersion !== currentVersion ||
    reviewedVersion <= pending.version
  )
    throw new Error(
      "Refresh and review the latest saved revision before reapplying."
    );
  return reviewedVersion;
}
