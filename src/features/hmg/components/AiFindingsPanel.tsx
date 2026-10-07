import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { workflow } from "../api";
import type { HmgAiFindings, HmgProject } from "../types";
import { Panel } from "./common";

/** Optional, explicitly requested analysis. Never changes authoritative workflow state. */
export function AiFindingsPanel({ project }: { project: HmgProject }) {
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<HmgAiFindings>();
  const lock = useRef(false),
    epoch = useRef(0);
  useEffect(() => {
    epoch.current++;
    setConsent(false);
    setResult(undefined);
    setError("");
    setBusy(false);
    lock.current = false;
    return () => {
      epoch.current++;
    };
  }, [project.id]);
  const request = async () => {
    if (!consent || lock.current || project.archived) return;
    const requestEpoch = epoch.current;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await workflow<HmgAiFindings>({
        command: "generateAiFindings",
        projectId: project.id,
        payload: { consent: true },
      });
      if (requestEpoch !== epoch.current) return;
      if (next.projectId !== project.id)
        throw new Error(
          "The AI response did not match this project. No findings were applied."
        );
      setResult(next);
    } catch (e) {
      if (requestEpoch === epoch.current)
        setError(
          e instanceof Error
            ? e.message
            : "AI is unavailable. Continue with the recorded evidence."
        );
    } finally {
      if (requestEpoch === epoch.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  const stale =
    !!result &&
    (result.projectVersion !== project.version ||
      result.selectionVersion !== project.selectionVersion);
  return (
    <Panel title="Optional AI evidence review">
      <Stack spacing={2}>
        <Alert severity="info">
          AI-generated · Unverified · Human review required. This optional
          review cannot approve suitability, pricing or stock, and never changes
          your project.
        </Alert>
        <FormControlLabel
          control={
            <Checkbox
              checked={consent}
              disabled={busy || project.archived}
              onChange={(_, v) => setConsent(v)}
            />
          }
          label="I agree to send this project's application, requirements and customer-visible evidence to the configured AI provider for this request. Names, private notes and commercial costs are excluded."
        />
        <Button
          variant="outlined"
          disabled={!consent || busy || project.archived}
          onClick={() => void request()}
          startIcon={busy ? <CircularProgress size={16} /> : undefined}
        >
          {busy ? "Reviewing evidence…" : "Request AI findings"}
        </Button>
        {project.archived && (
          <Alert severity="info">
            AI review is unavailable for archived projects. Existing history
            remains readable.
          </Alert>
        )}
        {error && (
          <Alert severity="error">
            {error} Core workflows remain available. No automatic retry will
            occur.
          </Alert>
        )}
        {result && (
          <>
            {stale && (
              <Alert severity="warning">
                Stale findings — the project or evidence changed. Request a new
                review before relying on this summary.
              </Alert>
            )}
            <Chip
              label={
                result.status === "ready"
                  ? "AI-generated findings"
                  : "AI unavailable"
              }
            />
            <Typography>{result.summary}</Typography>
            {result.status === "ready" && (
              <Typography variant="body2" color="text.secondary">
                Project revision {result.projectVersion} · Selection v
                {result.selectionVersion} ·{" "}
                {result.generatedAt
                  ? new Date(result.generatedAt).toLocaleString()
                  : "Generation time unavailable"}{" "}
                · Model: {result.model || "Not reported"}
              </Typography>
            )}
            {result.findings.map((finding, index) => (
              <Stack key={index} spacing={1}>
                <Typography variant="h3">{finding.claim}</Typography>
                <Typography>
                  Uncertainty:{" "}
                  {finding.uncertainty ||
                    "Not specified; verification is still required"}
                </Typography>
                <Typography variant="body2">
                  Evidence IDs:{" "}
                  {finding.evidenceIds.join(", ") ||
                    "No source supplied — do not treat as evidence"}
                </Typography>
                {!stale &&
                  finding.evidenceIds.map((id) => {
                    const evidence = project.evidence?.find((e) => e.id === id);
                    return (
                      <Typography
                        key={id}
                        variant="body2"
                        color="text.secondary"
                      >
                        {id}:{" "}
                        {evidence
                          ? `${evidence.label} · ${
                              evidence.scope || "Scope unknown"
                            } · ${evidence.source || "Source unknown"}`
                          : "Source no longer present in the current customer-visible evidence"}
                      </Typography>
                    );
                  })}
              </Stack>
            ))}
            <Typography variant="body2">
              {result.disclaimer ||
                "Generated suggestions are not verified technical evidence. A consultant must review the original sources."}
            </Typography>
          </>
        )}
      </Stack>
    </Panel>
  );
}
