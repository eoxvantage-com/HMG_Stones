import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { PageContainer } from "../../components";
import {
  useProjectCommand,
  useWorkflow,
  workflow,
} from "../../features/hmg/api";
import type {
  HmgList,
  HmgProject,
  HmgQuoteQueue,
  HmgQuoteQueueStatus,
  HmgQuoteCandidate,
} from "../../features/hmg/types";
import {
  CommandDialog,
  ConflictRecovery,
  EmptyState,
  LoadError,
  LoadingState,
  NextLink,
  PageHeading,
  Panel,
  StatusBadge,
} from "../../features/hmg/components/common";
import { useWorkspace } from "../../features/hmg/components/AppShell";
import { SalesPipeline } from "./sales-pipeline";
import { normalizedPage } from "./sales-stage";

function QuoteRowActions({
  quote,
  refreshQueue,
}: {
  quote: HmgQuoteQueue["data"][number];
  refreshQueue: () => unknown;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const project = useWorkflow<HmgProject>(
    "getSalesProject",
    quote.projectId,
    undefined,
    confirmOpen
  );
  const command = useProjectCommand(project.data, async () => {
    await Promise.all([project.refetch(), refreshQueue()]);
  });
  return (
    <>
      <Button component={RouterLink} to={`/quotes/${quote.projectId}`}>
        Edit
      </Button>
      {quote.deletable && (
        <Button color="error" onClick={() => setConfirmOpen(true)}>
          Delete
        </Button>
      )}
      <CommandDialog
        close={() => setConfirmOpen(false)}
        spec={
          confirmOpen
            ? {
                title: "Remove this quote?",
                description: `Remove revision ${quote.revision} for ${quote.projectName} from the active Quote Desk. Approved quotes and revisions already included in a customer proposal cannot be removed. This revision will remain in project history.`,
                label: "Remove quote",
                destructive: true,
                onConfirm: async () => {
                  if (project.loading || !project.data)
                    throw new Error("Project details are still loading. Try again shortly.");
                  if (project.data.version !== quote.projectVersion)
                    throw new Error("This project changed. Refresh the Quote Desk and review it before removing the quote.");
                  await command.run(
                    "withdrawQuoteDraft",
                    { confirmed: true },
                    quote.projectVersion
                  );
                  setConfirmOpen(false);
                },
              }
            : null
        }
      />
    </>
  );
}

const statuses: Record<HmgQuoteQueueStatus, string> = {
  all: "All quote series",
  draft: "Draft",
  awaiting: "Awaiting price review",
  ready: "Price ready",
  needs_revision: "Needs revision",
};
const money = (value: string | null, currency = "INR") =>
  value === null
    ? "Unknown"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
        Number(value)
      );
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "Not recorded";
function useQueueParams() {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "";
  const [input, setInput] = useState(search);
  const change = (key: string, value: string) =>
    setParams((old) => {
      const p = new URLSearchParams(old);
      value ? p.set(key, value) : p.delete(key);
      if (key !== "page") p.delete("page");
      return p;
    });
  useEffect(() => {
    setInput(search);
  }, [search]);
  useEffect(() => {
    if (input === search) return;
    const timer = setTimeout(() => change("q", input), 350);
    return () => clearTimeout(timer);
  }, [input, search]);
  const size = Number(params.get("size"));
  const pageSize = [10, 20, 50, 100].includes(size) ? size : 10;
  return {
    params,
    search,
    input,
    setInput,
    change,
    page: normalizedPage(params.get("page")),
    pageSize,
    clear: () => {
      setInput("");
      setParams({});
    },
  };
}
function Pager({
  total,
  state,
}: {
  total: number;
  state: ReturnType<typeof useQueueParams>;
}) {
  return (
    <TablePagination
      component="div"
      count={total}
      page={state.page - 1}
      rowsPerPage={state.pageSize}
      rowsPerPageOptions={[10, 20, 50, 100]}
      onPageChange={(_, p) => state.change("page", String(p + 1))}
      onRowsPerPageChange={(e) => state.change("size", e.target.value)}
    />
  );
}
// Authorized latest snapshots are selected server-side before paging. Direct DataGrid table reads
// would expose private revision rows, so these queues intentionally use the existing function provider.
export function ProjectQueue({
  kind = "projects",
}: {
  kind?: "projects" | "sales" | "quotes";
}) {
  if (kind === "sales") return <SalesPipeline />;
  return kind === "quotes" ? <QuoteQueue /> : <ProjectList />;
}
function ProjectList() {
  const context = useWorkspace();
  const state = useQueueParams();
  const stage = state.params.get("stage") || "";
  const archived = ["active", "archived", "all"].includes(
    state.params.get("archived") || ""
  )
    ? state.params.get("archived")!
    : "active";
  const allowed = true;
  const query = useWorkflow<HmgList<HmgProject>>(
    "listProjects",
    undefined,
    {
      search: state.search,
      stage,
      archived,
      page: state.page,
      pageSize: state.pageSize,
    },
    allowed
  );
  const [restoring, setRestoring] = useState<HmgProject>();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const command = useProjectCommand(restoring, query.refetch);
  if (!allowed)
    return (
      <PageContainer>
        <EmptyState
          title="Staff access required"
          description="This workspace is available only to authorized HMG staff."
        />
      </PageContainer>
    );
  const filtered = !!stage || archived !== "active";
  return (
    <PageContainer>
      <PageHeading
        eyebrow="My projects"
        title="Your spaces, thoughtfully considered"
        description="The brief, the decisions and the next step · connected in one place."
        action={
          context?.canCreate ? (
            <NextLink to="/projects/new">Create project</NextLink>
          ) : undefined
        }
      />
      {command.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {command.error}
        </Alert>
      )}
      <Panel>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} mb={2}>
          <TextField
            label="Search projects"
            value={state.input}
            onChange={(e) => state.setInput(e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            select
            label="Stage"
            value={stage}
            onChange={(e) => state.change("stage", e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All stages</MenuItem>
            {["Discovery", "Consultation", "Verification", "Quotation"].map(
              (s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              )
            )}
          </TextField>
          <TextField
            select
            label="Project visibility"
            value={archived}
            onChange={(e) => state.change("archived", e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="active">Active projects</MenuItem>
            <MenuItem value="archived">Archived projects</MenuItem>
            <MenuItem value="all">Active and archived</MenuItem>
          </TextField>
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
          {state.search && (
            <Chip
              label={`Search: ${state.search}`}
              onDelete={() => {
                state.setInput("");
                state.change("q", "");
              }}
            />
          )}
          {stage && (
            <Chip
              label={`Stage: ${stage}`}
              onDelete={() => state.change("stage", "")}
            />
          )}
          {archived !== "active" && (
            <Chip
              label={`Visibility: ${archived}`}
              onDelete={() => state.change("archived", "")}
            />
          )}
          {(state.search || filtered) && (
            <Button onClick={state.clear}>Clear all filters</Button>
          )}
        </Stack>
        {query.loading ? (
          <LoadingState />
        ) : query.error ? (
          <LoadError retry={() => query.refetch()} />
        ) : !query.data?.data.length ? (
          <EmptyState
            title={
              state.search
                ? "No results found"
                : filtered
                ? "No matching items"
                : "No projects yet"
            }
            description={
              state.search || filtered
                ? "Try adjusting the search or filters."
                : "Create your first project and give your room a direction."
            }
            action={
              state.search || filtered ? (
                <Button onClick={state.clear}>Clear filters</Button>
              ) : context?.canCreate ? (
                <NextLink to="/projects/new">Create project</NextLink>
              ) : undefined
            }
          />
        ) : (
          <TableContainer>
            <Table aria-label="Projects">
              <TableHead>
                <TableRow>
                  <TableCell>Project / room</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell align="right">Selection</TableCell>
                  <TableCell align="right">Open questions</TableCell>
                  <TableCell align="right">Next step</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.data.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Typography>{p.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {p.brief.room}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={p.archived ? "Archived" : p.stage} />
                    </TableCell>
                    <TableCell align="right">v{p.selectionVersion}</TableCell>
                    <TableCell align="right">
                      {
                        p.questions.filter((q) => q.status !== "Answered")
                          .length
                      }
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        component={RouterLink}
                        to={
                          `/projects/${p.id}`
                        }
                      >
                        Open project
                      </Button>
                      {p.archived &&
                        (context?.canCreate || context?.canPrice) && (
                          <Button
                            onClick={() => {
                              setRestoring(p);
                              setRestoreOpen(true);
                            }}
                          >
                            Restore project
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Pager total={query.data?.total || 0} state={state} />
      </Panel>
      <ConflictRecovery
        version={command.conflictVersion}
        refresh={async () => {
          if (!restoring) throw new Error("Choose the archived project first.");
          const latest = await workflow<HmgProject>({
            command: "getProject",
            projectId: restoring.id,
          });
          setRestoring(latest);
          return latest;
        }}
        onRebase={(version) => {
          command.rebase(version);
          setRestoreOpen(true);
        }}
      />
      <CommandDialog
        close={() => setRestoreOpen(false)}
        spec={
          restoring && restoreOpen
            ? {
                title: "Restore archived project?",
                description: `Restore “${restoring.name}” to the active project queue. Prior decisions and quote history will remain unchanged.`,
                label: "Restore project",
                onConfirm: () =>
                  command.run("restoreProject", {}, restoring.version),
              }
            : null
        }
      />
    </PageContainer>
  );
}
export function QuoteCreationPanel() {
  const context = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<HmgQuoteCandidate>();
  const candidates = useWorkflow<HmgList<HmgQuoteCandidate>>(
    "listQuoteCandidates",
    undefined,
    { search, page, pageSize: 10 },
    !!context?.canPrice
  );
  const project = useWorkflow<HmgProject>(
    "getSalesProject",
    selected?.projectId,
    undefined,
    !!selected && !!context?.canPrice
  );
  const command = useProjectCommand(project.data, candidates.refetch);
  if (!context?.canPrice) return null;
  return (
    <Panel title="Create a quote draft">
      <Typography>
        Choose a saved studio summary or current selection/advice request.
        Official stone prices start blank; authorized staff must enter them.
      </Typography>
      <TextField
        label="Find a quote-ready project"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        fullWidth
        sx={{ my: 2 }}
      />
      {search && (
        <Chip
          label={`Search: ${search}`}
          onDelete={() => {
            setSearch("");
            setPage(1);
          }}
        />
      )}
      {candidates.loading ? (
        <LoadingState />
      ) : candidates.error ? (
        <LoadError retry={() => candidates.refetch()} />
      ) : !candidates.data?.data.length ? (
        <EmptyState
          title={
            search ? "No quote-ready results" : "No quote-ready projects yet"
          }
          description="Save a design and prepare its unpriced summary in 3D Stone Studio, or save a preferred selection and request advice."
          action={
            <NextLink to="/design-dashboard">Open Design Dashboard</NextLink>
          }
        />
      ) : (
        <Stack spacing={1}>
          {candidates.data.data.map((c) => (
            <Stack
              key={`${c.projectId}:${c.summaryId || "selection"}`}
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              gap={2}
            >
              <Box>
                <Typography>{c.projectName}</Typography>
                <Typography variant="body2">
                  {c.kind === "studio"
                    ? `${c.designName} / Option ${c.option} / Design revision ${c.designRevision}`
                    : "Selection and advice request"}
                </Typography>
              </Box>
              <Button disabled={command.busy} onClick={() => setSelected(c)}>
                Create draft for {c.projectName}
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
      <TablePagination
        component="div"
        count={candidates.data?.total || 0}
        page={page - 1}
        rowsPerPage={10}
        rowsPerPageOptions={[10]}
        onPageChange={(_, v) => setPage(v + 1)}
      />
      {selected && project.loading && <LoadingState />}
      {selected && project.error && (
        <LoadError retry={() => project.refetch()} />
      )}
      {command.error && (
        <Alert severity="error">
          {command.error} Review the latest project below before retrying a confirmed
          conflict; uncertain saves retain their retry identity.
        </Alert>
      )}
      <ConflictRecovery
        version={command.conflictVersion}
        refresh={project.refreshValue}
        onRebase={(version) => {
          const reviewed = command.rebase(version);
          setSelected((c) => (c ? { ...c, projectVersion: reviewed } : c));
        }}
      />
      <CommandDialog
        close={() => setSelected(undefined)}
        spec={
          selected &&
          command.conflictVersion === undefined &&
          project.data?.id === selected.projectId &&
          !project.loading
            ? {
                title: selected.hasQuote ? "Replace current quote draft?" : "Create quotation draft?",
                description: `${selected.hasQuote ? "Replace the active quote with a new design-based revision" : "Create a versioned draft"} for ${
                  selected.projectName
                }. ${
                  selected.kind === "studio"
                    ? "Saved surface quantities and provenance are retained; all pricing fields start blank."
                    : "Legacy fictional demo rates apply."
                } The prior quote remains in revision history.`,
                label: selected.hasQuote ? "Replace quote draft" : "Create quotation draft",
                onConfirm: async () => {
                  const result = await command.run(
                    selected.kind === "studio"
                      ? "createStudioQuoteDraft"
                      : "createQuoteDraft",
                    selected.kind === "studio"
                      ? {
                          summaryId: selected.summaryId,
                          ...(selected.hasQuote ? { replaceExisting: true } : {}),
                        }
                      : {},
                    selected.projectVersion
                  );
                  navigate(`/quotes/${result.id}`);
                },
              }
            : null
        }
      />
    </Panel>
  );
}
export function QuoteQueue() {
  const context = useWorkspace();
  const state = useQueueParams();
  const status = (
    Object.hasOwn(statuses, state.params.get("status") || "")
      ? state.params.get("status")
      : "all"
  ) as HmgQuoteQueueStatus;
  const mine = state.params.get("owner") === "mine";
  const currentness =
    state.params.get("currentness") === "Stale"
      ? "Stale"
      : state.params.get("currentness") === "Current"
      ? "Current"
      : "all";
  const query = useWorkflow<HmgQuoteQueue>(
    "listQuotes",
    undefined,
    {
      search: state.search,
      status,
      ...(mine ? { ownerId: context?.actorId } : {}),
      currentness,
      page: state.page,
      pageSize: state.pageSize,
    },
    !!context?.canPrice
  );
  if (!context?.canPrice)
    return (
      <PageContainer>
        <EmptyState
          title="Quote access required"
          description="Pricing work is available only to the assigned consultant and authorized sales reviewers."
        />
      </PageContainer>
    );
  const filtered = status !== "all" || mine || currentness !== "all";
  return (
    <PageContainer>
      <PageHeading
        eyebrow="Quote Desk / 03"
        title="From selection to proposal"
        description="One current row per saved quote series. Price permission, technical readiness and stock are separate checks."
        action={
          <Button component={RouterLink} to="/sales">
            Open sales projects
          </Button>
        }
      />
      <QuoteCreationPanel />
      <Panel>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={3}>
          {Object.entries(statuses).map(([value, label]) => (
            <Button
              key={value}
              variant={status === value ? "contained" : "outlined"}
              onClick={() =>
                state.change("status", value === "all" ? "" : value)
              }
            >
              {label}
              {value !== "all" && query.data?.counts
                ? ` (${
                    query.data.counts[
                      value as Exclude<HmgQuoteQueueStatus, "all">
                    ]
                  })`
                : ""}
            </Button>
          ))}
        </Stack>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} mb={2}>
          <TextField
            label="Search quote projects"
            value={state.input}
            onChange={(e) => state.setInput(e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            select
            label="Quote owner"
            value={mine ? "mine" : "all"}
            onChange={(e) =>
              state.change("owner", e.target.value === "mine" ? "mine" : "")
            }
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All permitted owners</MenuItem>
            <MenuItem value="mine">Assigned to me</MenuItem>
          </TextField>
          <TextField
            select
            label="Selection currentness"
            value={currentness}
            onChange={(e) =>
              state.change(
                "currentness",
                e.target.value === "all" ? "" : e.target.value
              )
            }
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="all">All revisions</MenuItem>
            <MenuItem value="Current">Current selection</MenuItem>
            <MenuItem value="Stale">Selection changed</MenuItem>
          </TextField>
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
          {state.search && (
            <Chip
              label={`Search: ${state.search}`}
              onDelete={() => {
                state.setInput("");
                state.change("q", "");
              }}
            />
          )}
          {status !== "all" && (
            <Chip
              label={`Status: ${statuses[status]}`}
              onDelete={() => state.change("status", "")}
            />
          )}
          {mine && (
            <Chip
              label="Owner: me"
              onDelete={() => state.change("owner", "")}
            />
          )}
          {currentness !== "all" && (
            <Chip
              label={`Selection: ${currentness}`}
              onDelete={() => state.change("currentness", "")}
            />
          )}
          {(filtered || state.search) && (
            <Button onClick={state.clear}>Clear all filters</Button>
          )}
        </Stack>
        {query.loading ? (
          <LoadingState />
        ) : query.error ? (
          <LoadError retry={() => query.refetch()} />
        ) : !query.data?.data.length ? (
          <EmptyState
            title={
              state.search
                ? "No results found"
                : filtered
                ? "No matching items"
                : "No quotes yet"
            }
            description={
              filtered || state.search
                ? "Try adjusting the search or quote filters."
                : "Use Create a quote draft above for a saved studio summary or current advice request."
            }
            action={
              filtered || state.search ? (
                <Button onClick={state.clear}>Clear filters</Button>
              ) : (
                <NextLink to="/sales">Open sales projects</NextLink>
              )
            }
          />
        ) : (
          <TableContainer>
            <Table aria-label="Quote series">
              <TableHead>
                <TableRow>
                  <TableCell>Project / revision</TableCell>
                  <TableCell>Price review</TableCell>
                  <TableCell>Readiness</TableCell>
                  <TableCell align="right">Demo total</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.data.map((q) => (
                  <TableRow hover key={q.id}>
                    <TableCell>
                      <Typography>{q.projectName}</Typography>
                      <Typography variant="body2">
                        Quote v{q.revision} · Selection v{q.selectionVersion}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={statuses[q.queueStatus]}
                        warning={q.queueStatus === "needs_revision"}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={q.currentness}
                        warning={q.currentness !== "Current"}
                      />
                      <Typography variant="body2" color="text.secondary">
                        {q.readinessStatus}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {money(q.total, q.currency)}
                      <Typography variant="body2" color="text.secondary">
                        Illustrative tax · Demo only
                      </Typography>
                    </TableCell>
                    <TableCell>{date(q.updatedAt)}</TableCell>
                    <TableCell align="right">
                      <QuoteRowActions quote={q} refreshQueue={query.refetch} />
                      {q.queueStatus === "awaiting" && (
                        <Button
                          component={RouterLink}
                          to={`/quotes/${q.projectId}/approval`}
                        >
                          Review price
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Pager total={query.data?.total || 0} state={state} />
      </Panel>
    </PageContainer>
  );
}
const metrics = [
  ["preferredDirections", "Projects with a preferred direction"],
  ["adviceRequestsWaiting", "Advice requests waiting"],
  ["quotesAwaitingPriceReview", "Quotes awaiting price review"],
  ["selectionsChangedAfterQuote", "Selections changed after quote draft"],
] as const;
type OverviewData = Record<(typeof metrics)[number][0], number> & {
  projects: number;
  refreshedAt: string;
  blocked: Array<{ projectId: string; projectName: string; reason: string }>;
  recentDecisions: Array<{
    projectId: string;
    projectName: string;
    action: string;
    at: string;
  }>;
  drilldown?: Array<{ projectId: string; projectName: string; reason: string }>;
};
export function Overview() {
  const context = useWorkspace();
  const [params] = useSearchParams();
  const metric = metrics.find(([key]) => key === params.get("metric"))?.[0];
  const query = useWorkflow<OverviewData>(
    "overview",
    undefined,
    metric ? { metric } : undefined,
    !!context?.isExecutive
  );
  if (!context?.isExecutive)
    return (
      <PageContainer>
        <EmptyState title="Executive access required" />
      </PageContainer>
    );
  return (
    <PageContainer>
      <PageHeading
        eyebrow="Executive overview"
        title="A clear view of the work"
        description="Operational counts calculated from persisted demo records. Not revenue or performance claims."
      />
      {query.loading ? (
        <LoadingState />
      ) : query.error ? (
        <LoadError retry={() => query.refetch()} />
      ) : (
        <Stack gap={3}>
          <Typography color="text.secondary">
            {query.data?.projects ?? "Unavailable"} active sample projects ·
            Refreshed {date(query.data?.refreshedAt)}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                lg: "repeat(4, 1fr)",
              },
              gap: { xs: 2, md: 3 },
            }}
          >
            {metrics.map(([key, label]) => (
              <Panel key={key} title={label}>
                <Typography variant="h2" mb={2}>
                  {query.data?.[key] ?? "Unavailable"}
                </Typography>
                <Button
                  component={RouterLink}
                  to={`/overview?metric=${key}`}
                  aria-label={`View ${label.toLowerCase()}`}
                >
                  View matching work
                </Button>
              </Panel>
            ))}
          </Box>
          {metric && (
            <Panel title={metrics.find(([key]) => key === metric)![1]}>
              {query.data?.drilldown?.length ? (
                <Stack spacing={2}>
                  {query.data.drilldown.map((row) => (
                    <Box key={row.projectId}>
                      <Typography>{row.projectName}</Typography>
                      <Typography color="text.secondary">
                        {row.reason}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <EmptyState
                  title="No matching work"
                  description="No active demo projects currently meet this metric."
                />
              )}
              <Button component={RouterLink} to="/overview">
                Clear metric filter
              </Button>
            </Panel>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 3,
            }}
          >
            <Panel title="Where work is blocked">
              {query.data?.blocked?.length ? (
                <Stack spacing={2}>
                  {query.data.blocked.map((row, i) => (
                    <Box key={`${row.projectId}:${i}`}>
                      <Typography>{row.projectName}</Typography>
                      <Typography color="text.secondary">
                        {row.reason}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <EmptyState title="No blocked work reported" />
              )}
            </Panel>
            <Panel title="Recent decisions">
              {query.data?.recentDecisions?.length ? (
                <Stack spacing={2}>
                  {query.data.recentDecisions
                    .slice(-8)
                    .reverse()
                    .map((row, i) => (
                      <Box key={`${row.projectId}:${i}`}>
                        <Typography>{row.projectName}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {row.action.replace(/([A-Z])/g, " $1")} ·{" "}
                          {date(row.at)}
                        </Typography>
                      </Box>
                    ))}
                </Stack>
              ) : (
                <EmptyState title="No decisions yet" />
              )}
            </Panel>
          </Box>
          <Alert severity="info">
            Executive summaries do not grant access to private project notes,
            costs or customer records.
          </Alert>
        </Stack>
      )}
    </PageContainer>
  );
}
