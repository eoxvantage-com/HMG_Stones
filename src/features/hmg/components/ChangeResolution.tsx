import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { PageContainer } from "../../../components";
import { useProjectCommand, useWorkflow } from "../api";
import type { HmgChange, HmgList, HmgOption, HmgProject } from "../types";
import {
  ConflictRecovery,
  CommandDialog,
  CommandDialogSpec,
  Crumbs,
  LoadError,
  LoadingState,
  NextLink,
  PageHeading,
  Panel,
} from "./common";
import { EvidenceDrawer } from "./EvidenceDrawer";
export function ChangeResolution() {
  const { projectId, changeId } = useParams();
  const project = useWorkflow<HmgProject>("getProject", projectId);
  const change = useWorkflow<HmgChange>(
    "getChange",
    projectId,
    { changeId },
    !!changeId
  );
  const options = useWorkflow<HmgList<HmgOption>>("listOptions", undefined, {
    page: 1,
    pageSize: 50,
  });
  const command = useProjectCommand(project.data, () => {
    void change.refetch();
    return project.refetch();
  });
  const [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(false),
    [dialog, setDialog] = useState<CommandDialogSpec | null>(null);
  const [baseVersion, setBaseVersion] = useState<number>();
  useEffect(() => {
    setSelected("");
    setReason("");
    setBaseVersion(undefined);
    setDialog(null);
  }, [projectId, changeId]);
  if (project.loading || change.loading)
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  if (project.error || change.error || !project.data || !change.data)
    return (
      <PageContainer>
        <LoadError
          retry={() => {
            void project.refetch();
            void change.refetch();
          }}
        />
      </PageContainer>
    );
  const p = project.data,
    c = change.data,
    current = p.changes?.find((x) => x.id === changeId) || c;
  const eligible = (c.eligibleOptionIds || []).filter(
    (id) =>
      !p.rejected[id] &&
      !p.unavailable.includes(id) &&
      p.eligibility?.[id]?.status !== "Blocked"
  );
  return (
    <PageContainer>
      <Crumbs project={p.id} name={p.name} current="Resolve selection change" />
      <PageHeading
        title="A considered alternative"
        description="Keep the original decision and its reason in history. Create a successor selection, never rewrite a prior proposal."
      />
      <ConflictRecovery
        version={command.conflictVersion}
        refresh={project.refreshValue}
        onRebase={(v) => setBaseVersion(command.rebase(v))}
      />
      <Panel
        title={
          current.kind === "unavailable"
            ? "Availability changed"
            : "Technical mismatch"
        }
      >
        <Stack gap={2}>
          <Typography>{current.reason}</Typography>
          <Typography>
            Change {current.id} · Selection v{current.selectionVersion} ·{" "}
            {current.status}
          </Typography>
          {current.status === "Resolved" ? (
            <Alert severity="success">
              Resolved: {current.resolutionReason}. Successor selection v
              {current.successorSelectionVersion}.
            </Alert>
          ) : (
            <>
              <Alert severity="warning">
                Any earlier inquiry, quote or proposal may need a new revision.
                Unknown evidence is not approval.
              </Alert>
              <TextField
                select
                label="Replacement appearance"
                value={selected}
                onChange={(e) => {
                  setBaseVersion((v) => v ?? p.version);
                  setSelected(e.target.value);
                }}
                disabled={p.archived || command.busy}
              >
                {eligible.map((id) => (
                  <MenuItem key={id} value={id}>
                    {options.data?.data.find((o) => o.id === id)?.title || id}
                  </MenuItem>
                ))}
              </TextField>
              {!eligible.length && (
                <Alert severity="info">
                  No eligible replacement is available. Review Studio and add
                  another option, or ask your consultant to resolve evidence
                  blockers.
                </Alert>
              )}
              <TextField
                label="Reason for the replacement"
                required
                value={reason}
                onChange={(e) => {
                  setBaseVersion((v) => v ?? p.version);
                  setReason(e.target.value);
                }}
                multiline
                inputProps={{ maxLength: 500 }}
              />
              <Button disabled={!selected} onClick={() => setEvidence(true)}>
                Review replacement evidence
              </Button>
              <Button
                variant="contained"
                disabled={
                  !eligible.includes(selected) ||
                  !reason.trim() ||
                  p.archived ||
                  command.busy
                }
                onClick={() =>
                  setDialog({
                    title: "Confirm replacement?",
                    description:
                      "This records a new preferred appearance and retains the original change and historical snapshots. Technical verification is still required.",
                    label: "Confirm replacement",
                    onConfirm: () =>
                      command.run(
                        "resolveChange",
                        {
                          changeId,
                          optionId: selected,
                          reason: reason.trim(),
                          confirmed: true,
                        },
                        baseVersion ?? p.version
                      ),
                  })
                }
              >
                Confirm replacement
              </Button>
            </>
          )}
          {command.error && (
            <Alert severity="error">
              {command.error} Refresh and review the current selection before
              retrying.
              <Button
                onClick={() => {
                  void project.refetch();
                  void change.refetch();
                }}
              >
                Refresh
              </Button>
            </Alert>
          )}
          <NextLink to={`/projects/${p.id}`}>Back to project</NextLink>
        </Stack>
      </Panel>
      <EvidenceDrawer
        open={evidence}
        onClose={() => setEvidence(false)}
        project={p}
        option={options.data?.data.find((o) => o.id === selected)}
      />
      <CommandDialog spec={dialog} close={() => setDialog(null)} />
    </PageContainer>
  );
}
