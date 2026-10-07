import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import type { HmgEvidence, HmgEvidenceInput } from "../types";

const blank = (application: string): HmgEvidenceInput => ({
  label: "",
  status: "Pending",
  source: "",
  scope: "",
  date: "",
  subjectType: "project",
  application,
  claim: "",
  unknowns: [],
  customerVisible: false,
  hardMismatch: false,
});
export function validateEvidence(value: HmgEvidenceInput): string {
  if (!value.label.trim()) return "Name the check.";
  if (value.subjectType === "option" && !value.optionId)
    return "Choose the option this evidence concerns.";
  if (value.hardMismatch && value.subjectType !== "option")
    return "A hard mismatch must identify a specific option.";
  if (value.hardMismatch && value.status !== "Unsuitable")
    return "A hard mismatch must have the Unsuitable status.";
  if (["Verified", "Unsuitable"].includes(value.status)) {
    if (!value.source.trim()) return "Provide the evidence source.";
    if (!value.scope.trim()) return "Describe the reviewed scope.";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !Number.isFinite(Date.parse(value.date))
    )
      return "Enter a valid evidence date.";
    if (!value.claim.trim())
      return "Describe the specific claim this evidence supports.";
  }
  return "";
}

/** A review note is not a technical approval: scope, evidence and unknowns stay explicit. */
export function EvidenceEditor({
  version,
  application,
  optionIds,
  editing,
  busy,
  readOnly = false,
  onSave,
  onCancel,
  rebaseVersion,
}: {
  version: number;
  application: string;
  optionIds: string[];
  editing?: HmgEvidence;
  busy: boolean;
  readOnly?: boolean;
  rebaseVersion?: number;
  onSave: (value: HmgEvidenceInput, baseVersion: number) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<HmgEvidenceInput>(() =>
    editing ? { ...editing } : blank(application)
  );
  const [base, setBase] = useState<number>();
  const [error, setError] = useState("");
  useEffect(() => {
    setValue(editing ? { ...editing } : blank(application));
    setBase(editing ? version : undefined);
    setError("");
  }, [editing?.id]);
  useEffect(() => {
    if (rebaseVersion !== undefined) setBase(rebaseVersion);
  }, [rebaseVersion]);
  const change = (patch: Partial<HmgEvidenceInput>) => {
    setBase((v) => v ?? version);
    setValue((v) => ({ ...v, ...patch }));
    setError("");
  };
  const save = async () => {
    const invalid = validateEvidence(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      await onSave(value, base ?? version);
      setValue(blank(application));
      setBase(undefined);
      setError("");
      onCancel?.();
    } catch {
      setError(
        "Not saved. Your evidence draft is retained. Review the workspace error before retrying."
      );
    }
  };
  return (
    <Stack
      spacing={2}
      component="fieldset"
      disabled={busy || readOnly}
      sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
    >
      <Alert severity="info">
        Record only the claim supported by this evidence. Unknown and pending
        checks do not establish suitability, stock or price approval.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        required
        label="Check label"
        value={value.label}
        inputProps={{ maxLength: 120 }}
        onChange={(e) => change({ label: e.target.value })}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          fullWidth
          select
          label="Evidence concerns"
          value={value.subjectType}
          onChange={(e) =>
            change({
              subjectType: e.target.value as "project" | "option",
              optionId: undefined,
              hardMismatch: false,
            })
          }
        >
          <MenuItem value="project">Whole project</MenuItem>
          <MenuItem value="option">Specific option</MenuItem>
        </TextField>
        <TextField
          fullWidth
          select
          label="Review state"
          value={value.status}
          onChange={(e) =>
            change({
              status: e.target.value as HmgEvidenceInput["status"],
              hardMismatch:
                e.target.value === "Unsuitable" && value.hardMismatch,
            })
          }
        >
          {["Unknown", "Pending", "Verified", "Unsuitable", "Stale"].map(
            (s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            )
          )}
        </TextField>
      </Stack>
      {value.subjectType === "option" && (
        <TextField
          select
          required
          label="Option under review"
          value={value.optionId ?? ""}
          onChange={(e) => change({ optionId: e.target.value })}
        >
          {Array.from(
            new Set([...optionIds, ...(value.optionId ? [value.optionId] : [])])
          ).map((id) => (
            <MenuItem key={id} value={id}>
              {id}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        label="Application"
        value={value.application}
        inputProps={{ maxLength: 120 }}
        onChange={(e) => change({ application: e.target.value })}
      />
      <TextField
        label="Claim being reviewed"
        value={value.claim}
        multiline
        inputProps={{ maxLength: 500 }}
        onChange={(e) => change({ claim: e.target.value })}
      />
      <TextField
        label="Evidence source"
        value={value.source}
        inputProps={{ maxLength: 500 }}
        onChange={(e) => change({ source: e.target.value })}
      />
      <TextField
        label="Subject and scope"
        value={value.scope}
        multiline
        inputProps={{ maxLength: 500 }}
        onChange={(e) => change({ scope: e.target.value })}
      />
      <TextField
        label="Evidence date"
        type="date"
        InputLabelProps={{ shrink: true }}
        value={value.date}
        onChange={(e) => change({ date: e.target.value })}
      />
      <TextField
        label="Remaining unknowns"
        multiline
        helperText="One uncertainty per line. Do not use this field for private commercial notes."
        value={value.unknowns.join("\n")}
        inputProps={{ maxLength: 2000 }}
        onChange={(e) =>
          change({
            unknowns: e.target.value.split("\n").filter(Boolean).slice(0, 10),
          })
        }
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={value.customerVisible}
            onChange={(_, checked) => change({ customerVisible: checked })}
          />
        }
        label="Share this evidence with project customers"
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={value.hardMismatch}
            disabled={
              value.subjectType !== "option" || value.status !== "Unsuitable"
            }
            onChange={(_, checked) => change({ hardMismatch: checked })}
          />
        }
        label="This evidence establishes a hard mismatch for this option and application"
      />
      <Stack direction="row" justifyContent="space-between" spacing={2}>
        <Button
          onClick={() => {
            setValue(blank(application));
            setBase(undefined);
            setError("");
            onCancel?.();
          }}
        >
          Cancel evidence edit
        </Button>
        <Button
          variant="contained"
          disabled={busy || readOnly || !value.label.trim()}
          onClick={() => void save()}
        >
          {editing ? "Save evidence revision" : "Record check"}
        </Button>
      </Stack>
    </Stack>
  );
}
