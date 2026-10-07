import { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { PageContainer } from "../../components";
import { useProjectCommand, useWorkflow } from "../../features/hmg/api";
import type { HmgProject, HmgEvidence } from "../../features/hmg/types";
import { hasCurrentProposal, isSalesPipelineProject, permittedSalesStageMoves, salesStageCommand } from "./sales-stage";
import { EvidenceEditor } from "../../features/hmg/components/EvidenceEditor";
import { EvidenceDrawer } from "../../features/hmg/components/EvidenceDrawer";
import { DemoControls } from "../../features/hmg/components/DemoControls";
import { AiFindingsPanel } from "../../features/hmg/components/AiFindingsPanel";
import { useWorkspace } from "../../features/hmg/components/AppShell";
import {
  CommandDialog,
  CommandDialogSpec,
  ConflictRecovery,
  Crumbs,
  EmptyState,
  LoadError,
  LoadingState,
  NextLink,
  PageHeading,
  Panel,
  StatusBadge,
  columnGrid,
} from "../../features/hmg/components/common";

export function SalesProject() {
  const { projectId } = useParams();
  const context = useWorkspace();
  const query = useWorkflow<HmgProject>(
    "getSalesProject",
    projectId,
    undefined,
    !!context?.isStaff
  );
  const p = query.data;
  const command = useProjectCommand(p, query.refetch);
  const [tab, setTab] = useState(0);
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<CommandDialogSpec | null>(null);
  const [editingCheck, setEditingCheck] = useState<HmgEvidence>();
  const [checkVersion, setCheckVersion] = useState<number>();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<string | undefined>();
  const [noteVersion, setNoteVersion] = useState<number>();
  useEffect(() => {
    setNote("");
    setEditingNote(undefined);
    setNoteVersion(undefined);
    setDialog(null);
    setEditingCheck(undefined);
    setCheckVersion(undefined);
    setEvidenceOpen(false);
  }, [projectId]);
  if (!context?.isStaff)
    return (
      <PageContainer>
        <EmptyState title="Staff access required" />
      </PageContainer>
    );
  if (query.loading)
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  if (!p || query.error)
    return (
      <PageContainer>
        <LoadError retry={() => query.refetch()} />
      </PageContainer>
    );
  return (
    <PageContainer>
      <Crumbs project={p.id} name={p.name} current="Sales workspace" />
      <PageHeading
        eyebrow={`Sales Workspace / Selection v${p.selectionVersion}`}
        title={p.name}
        action={
          <Button
            component={RouterLink}
            to={`/projects/${p.id}`}
            variant="outlined"
          >
            Customer view
          </Button>
        }
      />
      <Stack direction="row" gap={1} mb={3}>
        <Button component={RouterLink} to={`/studio-3d?projectId=${encodeURIComponent(p.id)}`} variant="outlined">Open in 3D Stone Studio</Button>
        <StatusBadge label={p.stage} />
        <Chip label={`Revision ${p.version}`} />
        <Chip label="Staff-only workspace" variant="outlined" />
      </Stack>
      {command.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {command.error}
        </Alert>
      )}
      <ConflictRecovery
        version={command.conflictVersion}
        refresh={query.refreshValue}
        onRebase={(version) => {
          const reviewed = command.rebase(version);
          setNoteVersion(reviewed);
          setCheckVersion(reviewed);
        }}
      />
      {p.archived && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This project is archived and read-only. Restore it from the project
          queue before making changes.
        </Alert>
      )}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Brief & notes" />
        <Tab label={`Checks (${p.checks?.length || 0})`} />
        <Tab label={`Questions (${p.questions.length})`} />
        <Tab label={`Activity (${p.timeline.length})`} />
      </Tabs>
      <Box
        component="fieldset"
        disabled={p.archived}
        sx={{ ...columnGrid, border: 0, p: 0, m: 0, minWidth: 0 }}
      >
        <Stack gap={3}>
          {tab === 0 && (
            <>
              <Panel title="Inherited room brief">
                <Typography variant="h3" mb={2}>
                  {p.brief.room}
                </Typography>
                <Typography>
                  {p.brief.application} · {p.brief.quantity || "Unknown area"}{" "}
                  {p.brief.quantity ? p.brief.unit : ""}
                </Typography>
                <Typography my={2}>
                  Priorities: {p.brief.priorities.join(" / ") || "Not decided"}
                </Typography>
                <Typography>
                  Requirement: {p.brief.requirements || "Not specified"}
                </Typography>
                <Typography mt={2}>
                  Preferred direction: {p.preferredOptionId || "Not selected"}
                </Typography>
                <Typography color="text.secondary" mt={1}>
                  {p.inquiries.length} advice request(s) · {p.concepts.length}{" "}
                  saved concepts
                </Typography>
              </Panel>
              {context.canPrice && (
                <Panel title="Private consultant notes">
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Notes here are excluded from customer responses.
                  </Alert>
                  <Stack spacing={2}>
                    {p.notes?.map((n) => (
                      <Box key={n.id}>
                        <Typography>{n.text}</Typography>
                        <Button
                          onClick={() => {
                            setNote(n.text);
                            setEditingNote(n.id);
                            setNoteVersion(p.version);
                          }}
                        >
                          Edit draft
                        </Button>
                        <Button
                          color="error"
                          onClick={() =>
                            setDialog({
                              title: "Delete private note?",
                              description: `Delete “${n.text}”.`,
                              label: "Delete note",
                              destructive: true,
                              onConfirm: () =>
                                command.run("deleteStaffNoteDraft", {
                                  id: n.id,
                                }),
                            })
                          }
                        >
                          Delete draft
                        </Button>
                      </Box>
                    ))}
                    <TextField
                      label="Private note"
                      multiline
                      minRows={3}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        setNoteVersion((v) => v ?? p.version);
                      }}
                    />
                    <Button
                      variant="contained"
                      disabled={!note.trim() || command.busy}
                      onClick={() => {
                        void command
                          .run(
                            "saveStaffNote",
                            {
                              ...(editingNote ? { id: editingNote } : {}),
                              text: note,
                            },
                            noteVersion
                          )
                          .then(() => {
                            setNote("");
                            setEditingNote(undefined);
                            setNoteVersion(undefined);
                          })
                          .catch(() => {});
                      }}
                    >
                      Save private note
                    </Button>
                    {editingNote && (
                      <Button
                        onClick={() => {
                          setNote("");
                          setEditingNote(undefined);
                          setNoteVersion(undefined);
                        }}
                      >
                        Cancel note edit
                      </Button>
                    )}
                  </Stack>
                </Panel>
              )}
            </>
          )}
          {tab === 1 && (
            <Panel title="Verification checks">
              <Stack gap={2}>
                {p.checks?.map((c) => (
                  <Box
                    key={c.id}
                    sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}
                  >
                    <Typography>{c.label}</Typography>
                    <StatusBadge
                      label={c.status}
                      warning={c.status !== "Verified"}
                    />
                    <Typography variant="body2" color="text.secondary">
                      Source: {c.source || "No evidence"} · Scope:{" "}
                      {c.scope || "Not confirmed"} · {c.date || "No date"}
                    </Typography>
                    <Typography variant="body2">
                      {c.claim || "No specific claim recorded"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {c.customerVisible
                        ? "Shared with customer"
                        : "Staff only"}{" "}
                      · {c.application || "Application not recorded"}
                    </Typography>
                    <Button
                      disabled={command.busy}
                      onClick={() => {
                        setEditingCheck(c);
                        setCheckVersion(undefined);
                      }}
                    >
                      Edit evidence
                    </Button>
                  </Box>
                ))}
                <Button
                  variant="outlined"
                  onClick={() => setEvidenceOpen(true)}
                >
                  Open evidence details
                </Button>
                <EvidenceEditor
                  key={p.id}
                  version={p.version}
                  application={p.brief.application}
                  optionIds={p.shortlist}
                  editing={editingCheck}
                  rebaseVersion={checkVersion}
                  busy={command.busy}
                  readOnly={p.archived}
                  onCancel={() => {
                    setEditingCheck(undefined);
                    setCheckVersion(undefined);
                  }}
                  onSave={(value, base) =>
                    command.run("recordCheck", { ...value }, base)
                  }
                />
              </Stack>
            </Panel>
          )}
          {tab === 2 && (
            <Panel title="Customer-visible questions">
              <Alert severity="info" sx={{ mb: 2 }}>
                An answer is not technical verification. Record technical
                evidence separately.
              </Alert>
              <Stack spacing={3}>
                {p.questions.map((q) => (
                  <Box key={q.id}>
                    <Typography>{q.text}</Typography>
                    <Typography color="text.secondary">
                      {q.answer || "No answer yet"}
                    </Typography>
                    <Button
                      onClick={() =>
                        setDialog({
                          title: "Answer customer question?",
                          description: q.text,
                          label: "Save answer",
                          reason: true,
                          onConfirm: (answer) =>
                            command.run("answerQuestion", { id: q.id, answer }),
                        })
                      }
                    >
                      Answer question
                    </Button>
                  </Box>
                ))}
              </Stack>
            </Panel>
          )}
          {tab === 3 && (
            <Panel title="Versioned activity">
              <Stack gap={2}>
                {[...p.timeline].reverse().map((e) => (
                  <Box key={e.id}>
                    <Typography>{e.action}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(e.at).toLocaleString()} · v{e.version} ·{" "}
                      {e.reason}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Panel>
          )}
        </Stack>
        <Stack gap={3}>
          <Panel title="Next step">
            <Stack spacing={2}>
              {context.canPrice && (
                <NextLink to={`/quotes/${p.id}`}>Open Quote Desk</NextLink>
              )}
              <Button component={RouterLink} to={`/projects/${p.id}/review`}>
                Review customer selection
              </Button>
              <TextField
                select
                label="Sales stage"
                disabled={!context.canSales || command.busy || p.archived || ["Won", "Declined"].includes(p.stage)}
                value={p.stage}
                onChange={(e) => {
                  const nextStage = e.target.value;
                  const commandName = salesStageCommand(p);
                  if (nextStage === "Declined") {
                    setDialog({
                      title: "Decline this opportunity?",
                      description: `Record why ${p.name} will not proceed. This reason is restricted to authorized staff.`,
                      label: "Decline opportunity",
                      reason: true,
                      onConfirm: (reason) => command.run(commandName, { stage: "Declined", reason }),
                    });
                  } else {
                    void command.run(commandName, { stage: nextStage }).catch(() => {});
                  }
                }}
              >
                {Array.from(
                  new Set([
                    p.stage,
                    ...(context.canSales
                      ? isSalesPipelineProject(p)
                        ? permittedSalesStageMoves(p.stage, hasCurrentProposal(p))
                        : ["Discovery", "Consultation", "Verification", "Quotation"]
                      : []),
                  ])
                ).map((s) => (
                  <MenuItem key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Panel>
          <Panel title={`Tasks (${p.tasks?.length || 0})`}>
            {p.tasks?.map((t) => (
              <Box key={t.id} mb={2}>
                <Typography>{t.title}</Typography>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Task owner"
                  value={t.ownerId}
                  disabled={command.busy}
                  onChange={(event) => {
                    void command
                      .run("assignTask", {
                        id: t.id,
                        ownerId: event.target.value,
                        status: t.status,
                      })
                      .catch(() => {});
                  }}
                  sx={{ my: 1 }}
                >
                  {p.assignedConsultantId && (
                    <MenuItem value={p.assignedConsultantId}>
                      Project consultant
                    </MenuItem>
                  )}
                  {p.operationsId && (
                    <MenuItem value={p.operationsId}>
                      Operations reviewer
                    </MenuItem>
                  )}
                  {![p.assignedConsultantId, p.operationsId].includes(
                    t.ownerId
                  ) && <MenuItem value={t.ownerId}>Current owner</MenuItem>}
                </TextField>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Task status"
                  value={t.status}
                  disabled={command.busy}
                  onChange={(event) => {
                    void command
                      .run("assignTask", {
                        id: t.id,
                        ownerId: t.ownerId,
                        status: event.target.value,
                      })
                      .catch(() => {});
                  }}
                  sx={{ mb: 1 }}
                >
                  {["Open", "In progress", "Complete"].map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </TextField>
                <Typography variant="body2" color="text.secondary">
                  {t.status} · Owner {t.ownerId}
                </Typography>
              </Box>
            ))}
          </Panel>
          {p.preferredOptionId && context.canPrice && (
            <Panel title="Change recovery">
              <Typography color="text.secondary" mb={2}>
                Record an unavailable demo option without erasing the original
                preference or its history.
              </Typography>
              <Button
                disabled={
                  command.busy || p.unavailable.includes(p.preferredOptionId)
                }
                color="error"
                variant="outlined"
                onClick={() =>
                  setDialog({
                    title: "Mark demo option unavailable?",
                    description: `Mark ${p.preferredOptionId} unavailable and invalidate dependent pricing. Your reason is visible to project customers; do not include private commercial information.`,
                    label: "Mark unavailable",
                    reason: true,
                    destructive: true,
                    onConfirm: (reason) =>
                      command.run("markDemoLotUnavailable", {
                        optionId: p.preferredOptionId,
                        reason,
                      }),
                  })
                }
              >
                Mark demo lot unavailable
              </Button>
              <Button component={RouterLink} to={`/projects/${p.id}/compare`}>
                Choose an alternative
              </Button>
              {p.changes?.map((change) => (
                <Button
                  key={change.id}
                  component={RouterLink}
                  to={`/projects/${p.id}/changes/${change.id}`}
                >
                  Review {change.status.toLowerCase()} change
                </Button>
              ))}
            </Panel>
          )}
          <DemoControls
            project={p}
            command={command}
            refresh={query.refreshValue}
          />
          <AiFindingsPanel key={p.id} project={p} />
        </Stack>
      </Box>
      <CommandDialog spec={dialog} close={() => setDialog(null)} />
      <EvidenceDrawer
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        project={p}
      />
    </PageContainer>
  );
}
