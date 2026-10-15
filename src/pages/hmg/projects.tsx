import { useEffect, useState } from "react";
import { useWarnAboutChange } from "@refinedev/core";
import {
  Link as RouterLink,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { PageContainer } from "../../components";
import { moveOption, toggleComparison } from "../../features/hmg/selection";
import {
  useProjectCommand,
  useWorkflow,
  workflow,
} from "../../features/hmg/api";
import type {
  HmgBrief,
  HmgList,
  HmgOption,
  HmgProject,
} from "../../features/hmg/types";
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
import {
  DesignStudio,
  createDefaultDesignState,
  parseDesignState,
  DesignState,
} from "../../features/hmg/design";

import { comparisonFacts, differingFacts } from "../../features/hmg/comparison";
import { useWorkspace } from "../../features/hmg/components/AppShell";
import { AiFindingsPanel } from "../../features/hmg/components/AiFindingsPanel";
import { DemoControls } from "../../features/hmg/components/DemoControls";
import { useBriefAutosave } from "../../features/hmg/useBriefAutosave";
import { EvidenceDrawer } from "../../features/hmg/components/EvidenceDrawer";
import { PlanTo3DPanel } from "../../features/hmg/plan3d/PlanTo3DPanel";

const emptyBrief: HmgBrief = {
  room: "",
  application: "Living room feature wall",
  quantity: "",
  unit: "sq ft",
  priorities: ["", ""],
  requirements: "",
  budget: "",
  targetDate: "",
};
export function BriefForm({
  project,
  onSave,
  cancel,
  reviewedVersion,
}: {
  project?: HmgProject;
  onSave: (
    name: string,
    brief: HmgBrief,
    baseVersion?: number
  ) => Promise<unknown>;
  cancel?: () => void;
  reviewedVersion?: number;
}) {
  const [name, setName] = useState(project?.name || "");
  const [baseVersion, setBaseVersion] = useState(project?.version);
  const [brief, setBrief] = useState<HmgBrief>(project?.brief || emptyBrief);
  const [initial] = useState(() => ({
    name: project?.name || "",
    brief: project?.brief || emptyBrief,
  }));
  const valid =
    !!name.trim() &&
    name.trim().length <= 120 &&
    [
      brief.room,
      brief.application,
      brief.requirements,
      brief.budget || "",
    ].every((v) => v.length <= 500) &&
    brief.unit === "sq ft" &&
    !!brief.room.trim() &&
    !!brief.application.trim() &&
    (!brief.quantity ||
      (/^\d+(\.\d{1,2})?$/.test(brief.quantity) &&
        Number(brief.quantity) <= 1000000));
  const autosave = useBriefAutosave({
    value: { name: name.trim(), brief },
    initialValue: initial,
    initialVersion: baseVersion,
    valid,
    enabled: !!project && !project.archived,
    reviewedVersion,
    save: (draft, version) => onSave(draft.name, draft.brief, version),
  });
  const busy = autosave.status === "Saving",
    error = autosave.error;
  const { setWarnWhen } = useWarnAboutChange();
  const [discard, setDiscard] = useState<CommandDialogSpec | null>(null);
  useEffect(() => {
    setWarnWhen(autosave.dirty);
    return () => setWarnWhen(false);
  }, [autosave.dirty, setWarnWhen]);
  const closeEditor = () => {
    if (!autosave.dirty) {
      cancel?.();
      return;
    }
    setDiscard({
      title: "Discard unsaved changes?",
      description:
        "Only unsaved edits will be discarded. Previously autosaved revisions remain in project history.",
      label: "Discard unsaved edits",
      destructive: true,
      onConfirm: async () => cancel?.(),
    });
  };
  const field = (key: keyof HmgBrief, value: unknown) =>
    setBrief((b) => ({ ...b, [key]: value }));
  return (
    <Box
      component="form"
      onSubmit={async (e) => {
        e.preventDefault();
        await autosave.saveNow();
      }}
    >
      <Stack spacing={2}>
        <TextField
          disabled={project?.archived}
          label="Project name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          inputProps={{ maxLength: 120 }}
        />
        <TextField
          disabled={project?.archived}
          label="Room name"
          required
          value={brief.room}
          onChange={(e) => field("room", e.target.value)}
        />
        <TextField
          disabled={project?.archived}
          label="Application"
          required
          value={brief.application}
          onChange={(e) => field("application", e.target.value)}
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          <TextField
            disabled={project?.archived}
            label="Top priority"
            value={brief.priorities[0] || ""}
            onChange={(e) =>
              field("priorities", [e.target.value, brief.priorities[1] || ""])
            }
          />
          <TextField
            disabled={project?.archived}
            label="Second priority"
            value={brief.priorities[1] || ""}
            onChange={(e) =>
              field("priorities", [brief.priorities[0], e.target.value])
            }
          />
        </Box>
        <TextField
          disabled={project?.archived}
          label="Non-negotiable requirement"
          multiline
          value={brief.requirements || ""}
          onChange={(e) => field("requirements", e.target.value)}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2 }}>
          <TextField
            disabled={project?.archived}
            label="Approximate area"
            type="number"
            value={brief.quantity ?? ""}
            inputProps={{ min: 0, step: ".01" }}
            onChange={(e) => field("quantity", e.target.value)}
            helperText="Leave empty if unknown. Not a verified measurement."
          />
          <TextField
            disabled={project?.archived}
            select
            label="Unit"
            value={brief.unit}
            onChange={(e) => field("unit", e.target.value)}
          >
            <MenuItem value="sq ft">sq ft</MenuItem>
          </TextField>
        </Box>
        <TextField
          disabled={project?.archived}
          label="Budget preference"
          value={brief.budget || ""}
          onChange={(e) => field("budget", e.target.value)}
          helperText="Optional · Not decided if left empty"
        />
        <TextField
          disabled={project?.archived}
          label="Target date"
          type="date"
          value={brief.targetDate || ""}
          onChange={(e) => field("targetDate", e.target.value)}
          InputLabelProps={{ shrink: true }}
          helperText="Optional · Not decided if left empty"
        />
        {project && (
          <Typography role="status">
            {autosave.status}{" "}
            {autosave.dirty && !error
              ? "? valid changes save after 2 seconds"
              : ""}
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" justifyContent="flex-end" gap={1}>
          {cancel && (
            <Button variant="outlined" onClick={closeEditor} disabled={busy}>
              {project ? "Close editor" : "Cancel"}
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !valid || project?.archived}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
          >
            {busy ? "Saving..." : "Save room brief"}
          </Button>
        </Stack>
      </Stack>
      <CommandDialog spec={discard} close={() => setDiscard(null)} />
    </Box>
  );
}
export function NewProject() {
  const navigate = useNavigate();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <PageContainer>
      <Crumbs current="New project" />
      <PageHeading
        eyebrow="The first step"
        title="Tell us about your space"
        description="A real working project, with fictional sample information only."
      />
      <Box sx={{ maxWidth: 760 }}>
        <Panel title="Room brief">
          <BriefForm
            onSave={async (name, brief) => {
              const p = await workflow<HmgProject>({
                command: "createProject",
                idempotencyKey: key,
                payload: { name, brief },
              });
              navigate(`/projects/${p.id}`);
            }}
          />
        </Panel>
      </Box>
    </PageContainer>
  );
}
export function ProjectPage({
  mode = "project",
}: {
  mode?: "project" | "review" | "design" | "compare";
}) {
  const { projectId } = useParams();
  const query = useWorkflow<HmgProject>("getProject", projectId);
  const p = query.data;
  const context = useWorkspace();
  const command = useProjectCommand(p, query.refetch);
  const [dialog, setDialog] = useState<CommandDialogSpec | null>(null);
  const [tab, setTab] = useState(0);
  const [edit, setEdit] = useState(false);
  const [question, setQuestion] = useState("");
  const [editingQuestion, setEditingQuestion] = useState<string>();
  const [questionVersion, setQuestionVersion] = useState<number>();
  const [ack, setAck] = useState(false);
  const [scene, setScene] = useState<DesignState>(createDefaultDesignState);
  const [conceptId, setConceptId] = useState<string | undefined>();
  const [sceneVersion, setSceneVersion] = useState<number>();
  const [loadEpoch, setLoadEpoch] = useState(0);
  const [reviewedVersion, setReviewedVersion] = useState<number>();
  const [evidenceId, setEvidenceId] = useState<string>();
  const [differences, setDifferences] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  useEffect(() => {
    if (p)
      setCompareIds(p.shortlist.filter((id) => !p.rejected[id]).slice(0, 2));
  }, [p?.id]);
  useEffect(() => {
    if (p)
      setCompareIds((ids) =>
        ids.filter((id) => p.shortlist.includes(id) && !p.rejected[id])
      );
  }, [p?.version]);
  useEffect(() => {
    setScene(createDefaultDesignState());
    setConceptId(undefined);
    setSceneVersion(undefined);
    setLoadEpoch((v) => v + 1);
    setQuestion("");
    setEditingQuestion(undefined);
    setQuestionVersion(undefined);
    setDialog(null);
    setAck(false);
    setEdit(false);
    setReviewedVersion(undefined);
  }, [projectId]);
  const catalog = useWorkflow<HmgList<HmgOption>>("listOptions", undefined, {
    page: 1,
    pageSize: 50,
  });
  const title = (id: string | null) =>
    catalog.data?.data.find((o) => o.id === id)?.title ||
    id ||
    "No appearance preference yet";
  const ask = (
    action: string,
    optionId: string,
    label: string,
    destructive = false
  ) =>
    setDialog({
      title: `${label}?`,
      description: `${title(
        optionId
      )}. The prior decision remains in the project history.`,
      label,
      reason: true,
      destructive,
      onConfirm: (reason) =>
        command.run(action, { optionId, reason, confirmed: true }),
    });
  if (query.loading)
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  if (query.error || !p)
    return (
      <PageContainer>
        <LoadError retry={() => query.refetch()} />
      </PageContainer>
    );
  return (
    <PageContainer>
      <Crumbs
        project={mode === "project" ? undefined : p.id}
        name={p.name}
        current={
          mode === "project"
            ? p.name
            : mode === "design"
            ? "Design workspace"
            : mode === "review"
            ? "Selection review"
            : "Compare shortlist"
        }
      />
      <PageHeading
        eyebrow={`${p.brief.room} / Selection v${p.selectionVersion}`}
        title={
          mode === "design"
            ? "Explore the composition"
            : mode === "review"
            ? "A clear direction. A considered next step."
            : mode === "compare"
            ? "Compare your directions"
            : p.name
        }
        action={
          <Stack direction="row" gap={1} flexWrap="wrap">
            <StatusBadge label={p.stage} />
            <Button component={RouterLink} to={`/studio-3d?projectId=${encodeURIComponent(p.id)}`} variant="outlined">Open in 3D Stone Studio</Button>
            <Button onClick={() => query.refetch()} disabled={query.fetching}>
              Refresh
            </Button>
          </Stack>
        }
      />
      <Typography variant="body2" color="text.secondary" mb={3}>
        Project revision {p.version} ·{" "}
        {command.busy
          ? "Saving..."
          : command.error
          ? "Not saved · Your edits are retained"
          : "Saved on Taruvi"}{" "}
        · Appearance preference is not technical approval
        {query.updatedAt > 0 && (
          <> · Refreshed {new Date(query.updatedAt).toLocaleTimeString()}</>
        )}
      </Typography>
      {command.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {command.error}
          <Button onClick={() => query.refetch()}>Review latest version</Button>
        </Alert>
      )}
      {p.archived && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This project is archived. Editing is disabled; historical records
          remain readable.
          {(context?.canCreate || context?.canPrice) && (
            <Button
              onClick={() =>
                setDialog({
                  title: "Restore project?",
                  description: `Restore working access to ${p.name}. Existing history remains unchanged.`,
                  label: "Restore project",
                  onConfirm: () => command.run("restoreProject"),
                })
              }
            >
              Restore project
            </Button>
          )}
        </Alert>
      )}
      {(p.changes || [])
        .filter((c) => c.status === "Open")
        .map((c) => (
          <Alert key={c.id} severity="warning" sx={{ mb: 2 }}>
            {c.reason}
            <NextLink to={`/projects/${p.id}/changes/${c.id}`}>
              Review change
            </NextLink>
          </Alert>
        ))}
      <ConflictRecovery
        version={command.conflictVersion}
        refresh={query.refreshValue}
        onRebase={(version) => {
          const reviewed = command.rebase(version);
          setReviewedVersion(reviewed);
          setSceneVersion(reviewed);
          setQuestionVersion(reviewed);
        }}
      />
      <Box>
        {mode === "design" ? (
          <>
            <Stack direction="row" gap={1} flexWrap="wrap" mb={3}>
              <Chip label={`Preferred: ${title(p.preferredOptionId)}`} />
              <Chip label={`${p.concepts.length} saved concepts`} />
            </Stack>
            <DesignStudio
              resetKey={`${p.id}:${conceptId || "new"}:${loadEpoch}`}
              value={scene}
              onChange={(next) => {
                setSceneVersion((v) => v ?? p.version);
                setScene(next);
              }}
            />
            <Stack direction="row" gap={1} my={3}>
              <Button
                variant="contained"
                disabled={command.busy || p.archived}
                onClick={() => {
                  void command
                    .run(
                      "saveConcept",
                      {
                        ...(conceptId ? { id: conceptId } : {}),
                        name: scene.title || "Room composition",
                        scene,
                        optionId: p.preferredOptionId,
                      },
                      sceneVersion
                    )
                    .then((result) => {
                      setConceptId(
                        conceptId ||
                          result.concepts[result.concepts.length - 1]?.id
                      );
                      setSceneVersion(result.version);
                    })
                    .catch(() => {});
                }}
              >
                Save concept
              </Button>
              <Button
                onClick={() => {
                  setScene(createDefaultDesignState());
                  setSceneVersion(p.version);
                  setLoadEpoch((v) => v + 1);
                  setConceptId(undefined);
                }}
              >
                New concept
              </Button>
              <NextLink to={`/projects/${p.id}/review`}>
                Review selection
              </NextLink>
            </Stack>
            <Panel title={`Saved concepts (${p.concepts.length})`}>
              {p.concepts.length ? (
                <Stack gap={2}>
                  {p.concepts.map((c) => (
                    <Stack
                      key={c.id}
                      direction="row"
                      justifyContent="space-between"
                      gap={1}
                    >
                      <Typography>{c.name}</Typography>
                      <Stack direction="row">
                        <Button
                          onClick={() => {
                            const parsed = parseDesignState(c.scene);
                            if (parsed) {
                              setScene(parsed);
                              setSceneVersion(p.version);
                              setLoadEpoch((v) => v + 1);
                              setConceptId(c.id);
                            }
                          }}
                        >
                          Restore
                        </Button>
                        <Button
                          color="error"
                          disabled={p.archived || command.busy}
                          onClick={() =>
                            setDialog({
                              title: "Delete concept?",
                              description: `Delete “${c.name}”.`,
                              label: "Delete concept",
                              destructive: true,
                              onConfirm: () =>
                                command.run("deleteConcept", { id: c.id }),
                            })
                          }
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <EmptyState
                  title="No saved concepts yet"
                  description="Explore a composition above, then save it to this project."
                />
              )}
            </Panel>
          </>
        ) : mode === "review" ? (
          <Box sx={columnGrid}>
            <Panel title="Your selection summary">
              <Stack spacing={2}>
                <Typography variant="h3">
                  {title(p.preferredOptionId)}
                </Typography>
                <Chip
                  label="Preferred appearance · Needs verification"
                  color="warning"
                  variant="outlined"
                />
                <Typography>
                  {p.brief.application} · {p.brief.quantity || "Unknown area"}{" "}
                  {p.brief.quantity ? p.brief.unit : ""}
                </Typography>
                <Typography>
                  Priorities:{" "}
                  {p.brief.priorities.filter(Boolean).join(" / ") ||
                    "Not decided"}
                </Typography>
                <Typography>
                  Requirement: {p.brief.requirements || "Not specified"}
                </Typography>
                <Typography>
                  {p.questions.filter((q) => q.status !== "Answered").length}{" "}
                  open questions · {p.concepts.length} concepts
                </Typography>
                <Alert severity="info">
                  Reference visuals do not establish material identity, stock,
                  measurements or application suitability.
                </Alert>
                <FormControlLabel
                  control={
                    <Checkbox checked={ack} onChange={(_, v) => setAck(v)} />
                  }
                  label="I understand the references and 3D room are conceptual and require consultant verification."
                />
                <Button
                  variant="contained"
                  disabled={
                    !ack ||
                    !p.preferredOptionId ||
                    command.busy ||
                    p.archived ||
                    p.inquiries.some((i) => i.currentness === "Current")
                  }
                  onClick={() =>
                    setDialog({
                      title: "Request consultant advice?",
                      description:
                        "Save this selection version and create a consultant task in the demo workspace. No email or external message is sent.",
                      label: "Save advice request",
                      onConfirm: () =>
                        command.run("createInquiry", { acknowledged: true }),
                    })
                  }
                >
                  {p.inquiries.some((i) => i.currentness === "Current")
                    ? "Advice request saved for this selection"
                    : "Request consultant advice"}
                </Button>
              </Stack>
            </Panel>
            <Panel title="What happens next">
              <Typography color="text.secondary">
                Your consultant inherits this exact brief, selection version and
                open questions. Changes remain visible in the same project.
              </Typography>
              <Typography mt={2}>
                {p.inquiries.length} advice request(s) saved
              </Typography>
              {p.inquiries.map((inquiry) => (
                <Box key={inquiry.id} mt={2}>
                  <StatusBadge
                    label={`${
                      inquiry.currentness || inquiry.status
                    } · Selection v${inquiry.selectionVersion}`}
                    warning={inquiry.currentness === "Stale"}
                  />
                  {inquiry.currentness === "Stale" && (
                    <Typography variant="body2" color="text.secondary">
                      Historical request. Confirm the current selection to save
                      a new advice request.
                    </Typography>
                  )}
                </Box>
              ))}
              {p.proposals.map((proposal) => (
                <Button
                  key={proposal.id}
                  component={RouterLink}
                  to={`/projects/${p.id}/proposals/${proposal.id}`}
                >
                  Open proposal · {proposal.currentness || "Snapshot"}
                </Button>
              ))}
              <Box mt={3}>
                <NextLink to={`/projects/${p.id}`}>Back to project</NextLink>
              </Box>
            </Panel>
          </Box>
        ) : mode === "compare" ? (
          <>
            <Alert severity="info" sx={{ mb: 3 }}>
              Your priorities:{" "}
              {p.brief.priorities.filter(Boolean).join(" / ") ||
                "Not specified"}{" "}
              · Requirement: {p.brief.requirements || "Not specified"}
            </Alert>
            <Panel title="Choose your comparison">
              <Alert severity="info">
                Shared unknowns remain unverified: care, exact slab identity,
                measured quantity, availability and application suitability.
                Differences-only hides repeated fields, not these caveats.
                Review each option?s evidence and blockers before deciding.
              </Alert>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={differences}
                    onChange={(_, v) => setDifferences(v)}
                  />
                }
                label="Show differences only"
              />
              <Typography color="text.secondary" mb={1}>
                Compare up to 3 options. Remove one to add another.
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {p.shortlist
                  .filter((id) => !p.rejected[id])
                  .map((id) => (
                    <FormControlLabel
                      key={id}
                      label={title(id)}
                      control={
                        <Checkbox
                          checked={compareIds.includes(id)}
                          disabled={
                            !compareIds.includes(id) && compareIds.length >= 3
                          }
                          onChange={() =>
                            setCompareIds((ids) => toggleComparison(ids, id))
                          }
                        />
                      }
                    />
                  ))}
              </Stack>
            </Panel>
            {compareIds.filter(
              (id) => p.shortlist.includes(id) && !p.rejected[id]
            ).length < 2 ? (
              <EmptyState
                title="Save two options to compare"
                action={<NextLink to="/studio">Add from Studio</NextLink>}
              />
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                  gap: 3,
                }}
              >
                {compareIds
                  .filter((id) => p.shortlist.includes(id) && !p.rejected[id])
                  .map((id) => (
                    <Panel key={id} title={title(id)}>
                      <Stack spacing={2}>
                        <Chip label="Demo concept" />
                        {Object.entries(
                          comparisonFacts(
                            p,
                            catalog.data?.data.find((o) => o.id === id),
                            id
                          )
                        )
                          .filter(
                            ([key]) =>
                              !differences ||
                              [
                                "Technical eligibility",
                                "Evidence blockers",
                              ].includes(key) ||
                              differingFacts(
                                compareIds.map((oid) =>
                                  comparisonFacts(
                                    p,
                                    catalog.data?.data.find(
                                      (o) => o.id === oid
                                    ),
                                    oid
                                  )
                                )
                              ).includes(key)
                          )
                          .map(([key, value]) => (
                            <Typography key={key}>
                              {key}: {value}
                            </Typography>
                          ))}
                        {differences &&
                          !differingFacts(
                            compareIds.map((oid) =>
                              comparisonFacts(
                                p,
                                catalog.data?.data.find((o) => o.id === oid),
                                oid
                              )
                            )
                          ).length && (
                            <Typography>
                              No recorded differences. Shared unknowns are
                              hidden, not verified.
                            </Typography>
                          )}
                        <Button onClick={() => setEvidenceId(id)}>
                          Evidence and unknowns
                        </Button>
                        <Button
                          onClick={() =>
                            ask("keepAlternative", id, "Keep as alternative")
                          }
                          disabled={
                            p.archived ||
                            command.busy ||
                            p.eligibility?.[id]?.status === "Blocked"
                          }
                        >
                          Keep as alternative
                        </Button>
                        {p.alternatives?.[id] && (
                          <Typography>
                            Alternative reason: {p.alternatives[id]}
                          </Typography>
                        )}
                        {p.unavailable.includes(id) && (
                          <Alert severity="warning">
                            Demo option unavailable
                          </Alert>
                        )}
                        <Button
                          variant="contained"
                          disabled={
                            p.archived ||
                            command.busy ||
                            p.unavailable.includes(id) ||
                            p.eligibility?.[id]?.status === "Blocked"
                          }
                          onClick={() =>
                            ask("recordPreference", id, "Prefer appearance")
                          }
                        >
                          Prefer appearance
                        </Button>
                        <Button
                          color="error"
                          disabled={p.archived || command.busy}
                          onClick={() =>
                            ask(
                              "rejectOption",
                              id,
                              "Not for this project",
                              true
                            )
                          }
                        >
                          Not for this project
                        </Button>
                      </Stack>
                    </Panel>
                  ))}
              </Box>
            )}
          </>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={(_, v) => {
                if (!edit) setTab(v);
              }}
              sx={{ mb: 3 }}
              variant="scrollable"
            >
              <Tab label="Room brief" />
              <Tab label={`Shortlist (${p.shortlist.length})`} />
              <Tab label={`Questions (${p.questions.length})`} />
              <Tab label={`Activity (${p.timeline.length})`} />
              <Tab label={`Plan to 3D (${p.planUploads?.length || 0})`} />
            </Tabs>
            <Box sx={tab === 4 ? { display: "block" } : columnGrid}>
              <Stack spacing={3}>
                {tab === 0 && (
                  <Panel
                    title="The room brief"
                    action={
                      <Button
                        disabled={edit || p.archived || command.busy}
                        onClick={() => {
                          setReviewedVersion(undefined);
                          setEdit(!edit);
                        }}
                      >
                        {edit ? "Editor open" : "Edit brief"}
                      </Button>
                    }
                  >
                    {edit ? (
                      <BriefForm
                        project={p}
                        reviewedVersion={reviewedVersion}
                        cancel={() => setEdit(false)}
                        onSave={async (name, brief, baseVersion) => {
                          return command.run(
                            "updateBrief",
                            { name, brief },
                            baseVersion
                          );
                        }}
                      />
                    ) : (
                      <Stack spacing={2}>
                        <Typography variant="h3">{p.brief.room}</Typography>
                        <Typography>{p.brief.application}</Typography>
                        <Typography color="text.secondary">
                          {p.brief.quantity
                            ? `${p.brief.quantity} ${p.brief.unit} ? Approximate`
                            : "Area unknown"}{" "}
                          · Target: {p.brief.targetDate || "Not decided"}
                        </Typography>
                        <Typography>
                          Priorities:{" "}
                          {p.brief.priorities.filter(Boolean).join(" / ") ||
                            "Not decided"}
                        </Typography>
                        <Typography>
                          Non-negotiable:{" "}
                          {p.brief.requirements || "Not specified"}
                        </Typography>
                        <Typography>
                          Budget: {p.brief.budget || "Not decided"}
                        </Typography>
                      </Stack>
                    )}
                  </Panel>
                )}
                {tab === 1 && (
                  <Panel
                    title="Your shortlist"
                    action={
                      <Button component={RouterLink} to="/studio">
                        Add reference
                      </Button>
                    }
                  >
                    {p.shortlist.length ? (
                      <Stack spacing={3}>
                        {p.shortlist
                          .filter((id) => !p.rejected[id])
                          .map((id) => (
                            <Box
                              key={id}
                              sx={{
                                borderBottom: 1,
                                borderColor: "divider",
                                pb: 2,
                              }}
                            >
                              <Typography variant="h3">{title(id)}</Typography>
                              {id === p.preferredOptionId && (
                                <Chip
                                  label="Preferred appearance"
                                  variant="outlined"
                                  sx={{ my: 1 }}
                                />
                              )}
                              {p.unavailable.includes(id) && (
                                <Alert severity="warning">
                                  Unavailable demo option · choose an
                                  alternative
                                </Alert>
                              )}
                              <Stack
                                direction="row"
                                flexWrap="wrap"
                                gap={1}
                                mt={1}
                              >
                                <Button
                                  disabled={
                                    command.busy ||
                                    p.shortlist.indexOf(id) === 0
                                  }
                                  aria-label={`Move ${title(id)} up`}
                                  onClick={() => {
                                    void command
                                      .run("reorderShortlist", {
                                        optionIds: moveOption(
                                          p.shortlist,
                                          id,
                                          -1
                                        ),
                                      })
                                      .catch(() => {});
                                  }}
                                >
                                  Move up
                                </Button>
                                <Button
                                  disabled={
                                    command.busy ||
                                    p.shortlist.indexOf(id) ===
                                      p.shortlist.length - 1
                                  }
                                  aria-label={`Move ${title(id)} down`}
                                  onClick={() => {
                                    void command
                                      .run("reorderShortlist", {
                                        optionIds: moveOption(
                                          p.shortlist,
                                          id,
                                          1
                                        ),
                                      })
                                      .catch(() => {});
                                  }}
                                >
                                  Move down
                                </Button>
                                <Button
                                  disabled={
                                    p.archived ||
                                    p.unavailable.includes(id) ||
                                    p.eligibility?.[id]?.status === "Blocked" ||
                                    command.busy
                                  }
                                  onClick={() =>
                                    ask(
                                      "recordPreference",
                                      id,
                                      "Prefer appearance"
                                    )
                                  }
                                >
                                  Prefer this
                                </Button>
                                <Button
                                  disabled={p.archived || command.busy}
                                  onClick={() =>
                                    ask(
                                      "rejectOption",
                                      id,
                                      "Reject option",
                                      true
                                    )
                                  }
                                  color="error"
                                >
                                  Not for this project
                                </Button>
                                <Button
                                  disabled={p.archived || command.busy}
                                  onClick={() =>
                                    setDialog({
                                      title: "Remove option?",
                                      description: `Remove ${title(id)} from ${
                                        p.name
                                      }${
                                        p.preferredOptionId === id
                                          ? " and clear the current preference"
                                          : ""
                                      }. History remains intact.`,
                                      label: "Remove option",
                                      destructive: true,
                                      onConfirm: () =>
                                        command.run("removeFromShortlist", {
                                          optionId: id,
                                          confirmed: true,
                                        }),
                                    })
                                  }
                                >
                                  Remove
                                </Button>
                              </Stack>
                            </Box>
                          ))}
                      </Stack>
                    ) : (
                      <EmptyState
                        title="No saved options yet"
                        action={
                          <NextLink to="/studio">Explore directions</NextLink>
                        }
                      />
                    )}
                    {Object.keys(p.rejected).length > 0 && (
                      <Box mt={3}>
                        <Typography variant="h3">
                          Not for this project
                        </Typography>
                        {Object.entries(p.rejected).map(([id, reason]) => (
                          <Box key={id} mt={2}>
                            <Typography>
                              {title(id)} · {reason}
                            </Typography>
                            <Button
                              disabled={p.archived || command.busy}
                              onClick={() =>
                                ask("reconsiderOption", id, "Reconsider option")
                              }
                            >
                              Reconsider
                            </Button>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Panel>
                )}
                {tab === 2 && (
                  <Panel title="Questions for your consultant">
                    <Stack spacing={2}>
                      {p.questions.map((q) => (
                        <Box
                          key={q.id}
                          sx={{
                            borderBottom: 1,
                            borderColor: "divider",
                            pb: 2,
                          }}
                        >
                          <Stack direction="row" gap={1}>
                            <Chip label="Customer-visible" size="small" />
                            <StatusBadge label={q.status} />
                          </Stack>
                          <Typography my={1}>{q.text}</Typography>
                          {q.answer && (
                            <Typography color="text.secondary">
                              Answer: {q.answer}
                            </Typography>
                          )}
                          {!p.inquiries.length && q.status !== "Answered" && (
                            <Button
                              disabled={p.archived || command.busy}
                              onClick={() => {
                                setEditingQuestion(q.id);
                                setQuestion(q.text);
                                setQuestionVersion(p.version);
                              }}
                            >
                              Edit draft
                            </Button>
                          )}
                          {q.status !== "Answered" && !p.inquiries.length && (
                            <Button
                              color="error"
                              disabled={p.archived || command.busy}
                              onClick={() =>
                                setDialog({
                                  title: "Delete question draft?",
                                  description: `Delete “${q.text}”.`,
                                  label: "Delete draft",
                                  destructive: true,
                                  onConfirm: () =>
                                    command.run("deleteQuestionDraft", {
                                      id: q.id,
                                    }),
                                })
                              }
                            >
                              Delete draft
                            </Button>
                          )}
                        </Box>
                      ))}
                      <TextField
                        fullWidth
                        multiline
                        label="Ask about your selection"
                        value={question}
                        onChange={(e) => {
                          setQuestion(e.target.value);
                          setQuestionVersion((v) => v ?? p.version);
                        }}
                        inputProps={{ maxLength: 500 }}
                      />
                      <Button
                        variant="contained"
                        disabled={
                          p.archived || !question.trim() || command.busy
                        }
                        onClick={() => {
                          void command
                            .run(
                              "saveQuestion",
                              {
                                ...(editingQuestion
                                  ? { id: editingQuestion }
                                  : {}),
                                text: question,
                              },
                              questionVersion
                            )
                            .then(() => {
                              setQuestion("");
                              setEditingQuestion(undefined);
                              setQuestionVersion(undefined);
                            })
                            .catch(() => {});
                        }}
                      >
                        Save question
                      </Button>
                      {editingQuestion && (
                        <Button
                          onClick={() => {
                            setEditingQuestion(undefined);
                            setQuestion("");
                            setQuestionVersion(undefined);
                          }}
                        >
                          Cancel question edit
                        </Button>
                      )}
                    </Stack>
                  </Panel>
                )}
                {tab === 4 && (
                  <PlanTo3DPanel project={p} command={command} refresh={query.refetch} />
                )}
                {tab === 3 && (
                  <Panel title="Decision history">
                    {p.timeline.length ? (
                      <Stack spacing={3}>
                        {[...p.timeline].reverse().map((event) => (
                          <Box
                            key={event.id}
                            sx={{
                              borderLeft: 2,
                              borderColor: "divider",
                              pl: 2,
                            }}
                          >
                            <Typography>
                              {event.action.replaceAll("_", " ")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {new Date(event.at).toLocaleString()} · Version{" "}
                              {event.version} · Actor {event.actorId}
                            </Typography>
                            {event.reason && (
                              <Typography mt={1}>{event.reason}</Typography>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <EmptyState title="No decisions recorded yet" />
                    )}
                  </Panel>
                )}
              </Stack>
              {tab !== 4 && (
              <Stack spacing={3}>
                <AiFindingsPanel project={p} />
                {context?.canPrice && (
                  <DemoControls
                    project={p}
                    command={command}
                    refresh={query.refreshValue}
                  />
                )}
                <Panel title="Current choice">
                  <Button
                    onClick={() =>
                      setEvidenceId(p.preferredOptionId || "project")
                    }
                  >
                    Evidence and unknowns
                  </Button>
                  <Typography variant="h3" mb={2}>
                    {title(p.preferredOptionId)}
                  </Typography>
                  <StatusBadge label="Needs verification" warning />
                  <Typography color="text.secondary" mt={2}>
                    Your preference records appearance, not availability or
                    technical suitability.
                  </Typography>
                  <Stack spacing={1} mt={3}>
                    <Button
                      component={RouterLink}
                      to={`/projects/${p.id}/compare`}
                      variant="outlined"
                    >
                      Compare shortlist
                    </Button>
                    <Button
                      component={RouterLink}
                      to={`/projects/${p.id}/design`}
                      variant="outlined"
                    >
                      Open design workspace
                    </Button>
                    <NextLink to={`/projects/${p.id}/review`}>
                      Review selection
                    </NextLink>
                  </Stack>
                </Panel>
                <Button
                  color="error"
                  disabled={p.archived}
                  onClick={() =>
                    setDialog({
                      title: "Archive project?",
                      description: `Archive “${p.name}”. Existing decisions and quote history are retained.`,
                      label: "Archive project",
                      destructive: true,
                      onConfirm: () => command.run("archiveProject"),
                    })
                  }
                >
                  Archive project
                </Button>
              </Stack>
              )}
            </Box>
          </>
        )}
      </Box>
      <EvidenceDrawer
        open={!!evidenceId}
        onClose={() => setEvidenceId(undefined)}
        project={p}
        option={catalog.data?.data.find((o) => o.id === evidenceId)}
      />
      <CommandDialog spec={dialog} close={() => setDialog(null)} />
    </PageContainer>
  );
}
