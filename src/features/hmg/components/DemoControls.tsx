import { useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useWorkspace } from "./AppShell";
import { Panel } from "./common";
import { workflow, type useProjectCommand } from "../api";
import type { HmgProject, HmgResetPreview } from "../types";

export function DemoControls({
  project,
  command,
  refresh,
}: {
  project: HmgProject;
  command: ReturnType<typeof useProjectCommand>;
  refresh: () => Promise<HmgProject>;
}) {
  return (
    <ProjectDemoControls
      key={project.id}
      project={project}
      command={command}
      refresh={refresh}
    />
  );
}
function ProjectDemoControls({
  project,
  command,
  refresh,
}: {
  project: HmgProject;
  command: ReturnType<typeof useProjectCommand>;
  refresh: () => Promise<HmgProject>;
}) {
  const context = useWorkspace();
  const [preview, setPreview] = useState<HmgResetPreview>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [armOpen, setArmOpen] = useState(false);
  if (!context?.canPrice || project.isDemo !== true || project.archived)
    return null;
  const getPreview = async () => {
    setLoading(true);
    setError("");
    try {
      setPreview(
        await workflow<HmgResetPreview>({
          command: "previewDemoReset",
          projectId: project.id,
        })
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reset preview unavailable. No data was changed."
      );
    } finally {
      setLoading(false);
    }
  };
  const reset = async () => {
    if (!preview || command.busy) return;
    setError("");
    try {
      await command.run(
        "resetDemoProject",
        { previewToken: preview.previewToken, confirmed: true },
        preview.version
      );
      setPreview(undefined);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reset not confirmed. Refresh and review before retrying."
      );
    }
  };
  return (
    <Panel title="Demo test controls">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Only this fictional project is affected. These controls never send
          messages, reserve stock or create orders.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {command.failureArmed && (
          <Alert severity="warning">
            One failure is armed for the next save in this workspace tab. Its
            edits will be retained.
          </Alert>
        )}
        <Button
          variant="outlined"
          disabled={command.busy || command.failureArmed}
          onClick={() => setArmOpen(true)}
        >
          Fail next save
        </Button>
        {command.failureArmed && (
          <Button onClick={() => command.cancelFailure()}>
            Cancel armed failure
          </Button>
        )}
        <Button
          color="error"
          variant="outlined"
          disabled={loading || command.busy || command.failureArmed}
          onClick={() => void getPreview()}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          Preview project reset
        </Button>
      </Stack>
      <Dialog
        open={armOpen}
        onClose={() => setArmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Fail the next demo save?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Arm one intentional failure before data is committed for “
            {project.name}”. The draft stays on screen. Retry deliberately after
            the failure; no other user's session is affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              command.armFailure();
              setArmOpen(false);
            }}
          >
            Arm one failed save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!preview}
        onClose={() => {
          if (!command.busy) setPreview(undefined);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reset this demo project?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Reset only “{preview?.projectName}”, reviewed revision{" "}
            {preview?.version}. No other project or user is changed. This action
            cannot be undone.
          </DialogContentText>
          {preview && (
            <Stack spacing={2} mt={2}>
              <Typography>{preview.summary}</Typography>
              <Typography variant="body2">
                Working drafts affected: {preview.counts.questions} questions,{" "}
                {preview.counts.concepts} concepts, {preview.counts.notes}{" "}
                notes, {preview.counts.checks} checks, {preview.counts.tasks}{" "}
                tasks.
              </Typography>
              <Alert severity="info">
                History retained: {preview.counts.inquiriesRetained} advice
                snapshots, {preview.counts.proposalsRetained} proposals and{" "}
                {preview.counts.quoteRevisionsRetained} quote revisions. Prior
                outputs become stale; old approvals do not carry forward.
              </Alert>
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={command.busy} onClick={() => setPreview(undefined)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={command.busy || !preview}
            onClick={() => void reset()}
            startIcon={
              command.busy ? <CircularProgress size={16} /> : undefined
            }
          >
            Reset this demo project
          </Button>
        </DialogActions>
      </Dialog>
    </Panel>
  );
}
