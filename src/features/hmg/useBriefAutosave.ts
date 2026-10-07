import { useEffect, useRef, useState } from "react";

/** Keeps the editor's revision isolated from polling. Errors require deliberate retry. */
export function useBriefAutosave<T>({
  value,
  initialValue,
  initialVersion,
  valid,
  enabled,
  save,
  reviewedVersion,
}: {
  value: T;
  initialValue: T;
  initialVersion?: number;
  valid: boolean;
  enabled: boolean;
  save: (value: T, version?: number) => Promise<unknown>;
  reviewedVersion?: number;
}) {
  const [saved, setSaved] = useState(() => JSON.stringify(initialValue));
  const [status, setStatus] = useState<"Saved" | "Saving" | "Not saved">(
    "Saved"
  );
  const [error, setError] = useState("");
  const version = useRef(initialVersion),
    blocked = useRef(false),
    lock = useRef(false),
    mounted = useRef(true);
  const latest = useRef({ value, save, valid });
  latest.current = { value, save, valid };
  const signature = JSON.stringify(value),
    dirty = signature !== saved;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (reviewedVersion !== undefined) {
      version.current = reviewedVersion;
      blocked.current = true;
      setError(
        "Latest revision reviewed. Save explicitly to apply your retained draft."
      );
    }
  }, [reviewedVersion]);
  const saveNow = async () => {
    if (lock.current || !latest.current.valid) return;
    lock.current = true;
    setStatus("Saving");
    setError("");
    const snapshot = latest.current.value,
      submitted = JSON.stringify(snapshot);
    try {
      const result = await latest.current.save(snapshot, version.current);
      if (
        result &&
        typeof result === "object" &&
        "version" in result &&
        typeof result.version === "number"
      )
        version.current = result.version;
      blocked.current = false;
      if (mounted.current) {
        setSaved(submitted);
        setStatus("Saved");
      }
    } catch (e) {
      blocked.current = true;
      if (mounted.current) {
        setStatus("Not saved");
        setError(e instanceof Error ? e.message : "Not saved");
      }
    } finally {
      lock.current = false;
    }
  };
  useEffect(() => {
    if (!enabled || !dirty || !valid || blocked.current || lock.current) return;
    setStatus("Not saved");
    const timer = setTimeout(() => {
      void saveNow();
    }, 2000);
    return () => clearTimeout(timer);
  }, [signature, saved, enabled, valid, status]);
  return {
    status: dirty && status === "Saved" ? ("Not saved" as const) : status,
    error,
    dirty,
    saveNow,
  };
}
