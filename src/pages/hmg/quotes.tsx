import { useEffect, useState } from "react";
import { useWarnAboutChange } from "@refinedev/core";
import { Link as RouterLink, useParams } from "react-router";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { PageContainer } from "../../components";
import { useProjectCommand, useWorkflow } from "../../features/hmg/api";
import type { HmgProject, HmgQuote, QuoteLine } from "../../features/hmg/types";
import { useWorkspace } from "../../features/hmg/components/AppShell";
import { calculatePreview } from "../../features/hmg/quotes/calculateQuote";
import {
  CommandDialog,
  CommandDialogSpec,
  ConflictRecovery,
  Crumbs,
  DEMO_LABEL,
  EmptyState,
  LoadError,
  LoadingState,
  NextLink,
  PageHeading,
  Panel,
  StatusBadge,
  columnGrid,
} from "../../features/hmg/components/common";
const blankLine = (): QuoteLine => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "",
  unit: "sq ft",
  allowancePct: "0",
  rate: "",
  discountPct: "0",
  taxPct: "18",
  currency: "INR",
});
export function QuoteEditor() {
  const { quoteId } = useParams();
  const context = useWorkspace();
  const query = useWorkflow<HmgProject>(
    "getSalesProject",
    quoteId,
    undefined,
    !!context?.canPrice
  );
  const p = query.data;
  const quote = p?.quote;
  const studio = quote?.source?.kind === "studio";
  const currentSummaries = (p?.studioQuoteSummaries || []).filter(
    (q) =>
      q.lines.some((l) => l.assetId) &&
      p?.stoneStudioDesigns?.some(
        (d) =>
          d.design.id === q.designId &&
          d.revision === q.designRevision &&
          d.design.geometryRevision === q.geometryRevision
      )
  );
  const command = useProjectCommand(p, query.refetch);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [assumptions, setAssumptions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState<number>();
  const [dialog, setDialog] = useState<CommandDialogSpec | null>(null);
  useEffect(() => {
    setDirty(false);
    setLines([]);
    setAssumptions("");
    setExclusions("");
    setBaseVersion(undefined);
    setDialog(null);
  }, [quoteId]);
  useEffect(() => {
    if (!dirty && quote) {
      setLines(quote.lines);
      setAssumptions(quote.assumptions.join("\n"));
      setExclusions(quote.exclusions.join("\n"));
      setBaseVersion(p?.version);
    }
  }, [quote?.revision, quote?.id, dirty, p?.version]);
  const setLine = (id: string, field: keyof QuoteLine, value: string) => {
    setDirty(true);
    setLines((ls) =>
      ls.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };
  const { setWarnWhen } = useWarnAboutChange();
  useEffect(() => {
    setWarnWhen(dirty);
    return () => setWarnWhen(false);
  }, [dirty, setWarnWhen]);
  const totals = calculatePreview(lines);
  if (!context?.canPrice)
    return (
      <PageContainer>
        <EmptyState title="Quote staff access required" />
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
      <Crumbs project={p.id} name={p.name} current="Quote Desk" />
      <PageHeading
        eyebrow="Quote Desk / Demo draft"
        title={`A proposal for ${p.name}`}
        action={
          <Button
            component={RouterLink}
            to={`/sales/projects/${p.id}`}
            variant="outlined"
          >
            Back to sales project
          </Button>
        }
      />
      <Stack direction="row" gap={1} mb={3}>
        <Chip label={`Selection v${p.selectionVersion}`} />
        <Chip label={`Quote revision ${quote?.revision || "—"}`} />
        {quote && (
          <StatusBadge
            label={quote.pricingStatus}
            warning={quote.currentness !== "Current"}
          />
        )}
      </Stack>
      {studio && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Studio source: Option {quote.source?.option}, design revision{" "}
          {quote.source?.designRevision}.{" "}
          <Button
            component={RouterLink}
            to={`/studio-3d?projectId=${p.id}&designId=${quote.source?.designId}`}
          >
            Open source design
          </Button>
        </Alert>
      )}
      {command.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {command.error}
          <Button onClick={() => query.refetch()}>Review latest version</Button>
        </Alert>
      )}
      <ConflictRecovery
        version={command.conflictVersion}
        refresh={query.refreshValue}
        onRebase={(version) => setBaseVersion(command.rebase(version))}
      />
      {!studio &&
        !currentSummaries.length &&
        !p.inquiries.some((i) => i.currentness === "Current") && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            A current preferred selection and a current advice request are
            required before quoting.{" "}
            <Button component={RouterLink} to={`/projects/${p.id}/review`}>
              Review and request advice
            </Button>
          </Alert>
        )}
      {currentSummaries.length > 0 &&
        (!quote || (studio && quote.currentness !== "Current")) && (
          <Panel
            title={
              quote
                ? "Refresh from saved design"
                : "Create from saved studio design"
            }
          >
            <Typography>
              Choose a current saved summary. Surface quantities and official
              provenance are retained. Rates, allowance, discount and tax start
              blank for authorized entry.
            </Typography>
            {currentSummaries.map((summary) => (
              <Button
                key={summary.id}
                disabled={command.busy || p.archived || dirty}
                onClick={() =>
                  setDialog({
                    title: quote
                      ? "Replace the studio quote source?"
                      : "Create studio quotation draft?",
                    description: quote
                      ? "The previous quote remains in history. This new summary replaces the working draft, clears rates and approval, and requires a new review."
                      : "Create an unpriced staff-editable draft from saved surface quantities. No order or external message is sent.",
                    label: quote
                      ? "Replace working draft"
                      : "Create studio draft",
                    onConfirm: async () => {
                      await command.run(
                        "createStudioQuoteDraft",
                        {
                          summaryId: summary.id,
                          ...(quote ? { replaceExisting: true } : {}),
                        },
                        p.version
                      );
                      setDirty(false);
                    },
                  })
                }
              >
                Option {summary.option} / Design revision{" "}
                {summary.designRevision} / {summary.totalAreaM2} m2
              </Button>
            ))}
          </Panel>
        )}
      {!quote ? (
        <Panel>
          <EmptyState
            title="No quotation draft yet"
            description={currentSummaries.length ? "Create from a saved studio summary above. Legacy selection quoting below remains a separate fictional-data flow." : "Save a studio design and prepare its summary, or use a preferred selection with a current advice request. Legacy commercial sample data is fictional."}
            action={
              <Button
                variant="contained"
                disabled={
                  command.busy ||
                  p.archived ||
                  !p.preferredOptionId ||
                  !p.inquiries.some((i) => i.currentness === "Current")
                }
                onClick={() => {
                  void command.run("createQuoteDraft").catch(() => {});
                }}
              >
                Create quote draft
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <Alert severity="info" sx={{ mb: 3 }}>
            {studio
              ? "Official-material studio draft. No rates or costs are inferred. Enter rate, allowance, discount and tax explicitly; blanks remain unknown."
              : "Fictional demo rates. Blank quantity or rate means unknown, never zero."}{" "}
            No reservation, order or binding acceptance.
          </Alert>
          {quote.currentness !== "Current" && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              {studio
                ? "This quote is stale against its saved design. Prepare a current summary in the Studio, then explicitly replace the working draft above; old history is retained and approval resets."
                : "This quote is not current with the selection. Save a new revision before approval or proposal creation."}
            </Alert>
          )}
          <Box sx={columnGrid}>
            <Stack spacing={3}>
              <Panel
                title="Quantities & pricing"
                action={
                  <Button
                    disabled={studio || p.archived || command.busy}
                    onClick={() => {
                      setLines([...lines, blankLine()]);
                      setDirty(true);
                    }}
                  >
                    Add line
                  </Button>
                }
              >
                <Stack spacing={3}>
                  {lines.map((line, i) => (
                    <Box
                      key={line.id}
                      sx={{ borderBottom: 1, borderColor: "divider", pb: 3 }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        mb={2}
                      >
                        <Typography variant="h3">Line {i + 1}</Typography>
                        <Button
                          color="error"
                          disabled={studio || p.archived || command.busy}
                          onClick={() =>
                            setDialog({
                              title: "Remove quote line?",
                              description: `Remove “${
                                line.description || `Line ${i + 1}`
                              }” from this unsaved draft. Save a new revision to persist this change.`,
                              label: "Remove line",
                              destructive: true,
                              onConfirm: async () => {
                                setLines((ls) =>
                                  ls.filter((l) => l.id !== line.id)
                                );
                                setDirty(true);
                              },
                            })
                          }
                        >
                          Remove
                        </Button>
                      </Stack>
                      {line.source && (
                        <Alert severity="info">
                          Saved source: {line.source.title} /{" "}
                          {line.source.surfaceId}. Quantity and unit are fixed
                          to the summary.{" "}
                          <Button
                            component="a"
                            href={line.source.sourcePageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Official source
                          </Button>
                        </Alert>
                      )}
                      <TextField
                        fullWidth
                        label="Description"
                        required
                        value={line.description}
                        onChange={(e) =>
                          setLine(line.id, "description", e.target.value)
                        }
                        sx={{ mb: 2 }}
                      />
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                          gap: 2,
                        }}
                      >
                        <TextField
                          label="Quantity"
                          disabled={studio || p.archived}
                          value={line.quantity}
                          type="number"
                          inputProps={{ min: 0, step: ".01" }}
                          onChange={(e) =>
                            setLine(line.id, "quantity", e.target.value)
                          }
                        />
                        <TextField
                          select
                          label="Unit"
                          disabled={studio || p.archived}
                          value={line.unit}
                          onChange={(e) =>
                            setLine(line.id, "unit", e.target.value)
                          }
                        >
                          {(studio ? ["m\u00b2"] : ["sq ft"]).map((v) => (
                            <MenuItem key={v} value={v}>
                              {v}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label={`Rate (${line.currency} / ${line.unit})`}
                          value={line.rate}
                          type="number"
                          inputProps={{ min: 0, step: ".01" }}
                          onChange={(e) =>
                            setLine(line.id, "rate", e.target.value)
                          }
                        />
                        <TextField
                          label="Allowance (%)"
                          value={line.allowancePct}
                          type="number"
                          inputProps={{ min: 0, max: 50, step: ".01" }}
                          onChange={(e) =>
                            setLine(line.id, "allowancePct", e.target.value)
                          }
                        />
                        <TextField
                          label="Discount (%)"
                          value={line.discountPct}
                          type="number"
                          inputProps={{ min: 0, max: 30, step: ".01" }}
                          onChange={(e) =>
                            setLine(line.id, "discountPct", e.target.value)
                          }
                        />
                        <TextField
                          label="Tax (%)"
                          value={line.taxPct}
                          type="number"
                          inputProps={{ min: 0, max: 30, step: ".01" }}
                          onChange={(e) =>
                            setLine(line.id, "taxPct", e.target.value)
                          }
                        />
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Panel>
              <Panel title="Scope & conditions">
                <Stack spacing={2}>
                  <TextField
                    multiline
                    minRows={3}
                    label="Assumptions (one per line)"
                    value={assumptions}
                    onChange={(e) => {
                      setAssumptions(e.target.value);
                      setDirty(true);
                    }}
                  />
                  <TextField
                    multiline
                    minRows={3}
                    label="Exclusions (one per line)"
                    value={exclusions}
                    onChange={(e) => {
                      setExclusions(e.target.value);
                      setDirty(true);
                    }}
                  />
                </Stack>
              </Panel>
              <Stack direction="row" justifyContent="flex-end" gap={1}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setDirty(false);
                    setLines(quote.lines);
                    setAssumptions(quote.assumptions.join("\n"));
                    setExclusions(quote.exclusions.join("\n"));
                  }}
                >
                  Discard unsaved edits
                </Button>
                <Button
                  variant="contained"
                  disabled={
                    command.busy ||
                    p.archived ||
                    (studio
                      ? quote.currentness !== "Current"
                      : !p.inquiries.some(
                          (i) => i.currentness === "Current"
                        )) ||
                    (!dirty && quote.currentness === "Current")
                  }
                  onClick={() => {
                    void command
                      .run(
                        "saveQuoteRevision",
                        {
                          lines,
                          assumptions: assumptions.split("\n").filter(Boolean),
                          exclusions: exclusions.split("\n").filter(Boolean),
                        },
                        baseVersion
                      )
                      .then(() => setDirty(false))
                      .catch(() => {});
                  }}
                >
                  Save new revision
                </Button>
              </Stack>
            </Stack>
            <Stack spacing={3}>
              <Panel title={dirty ? "Unsaved estimate" : "Quotation summary"}>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    {lines[0]?.currency || "INR"} · Decimal calculation · Taxes
                    shown separately · Illustrative tax · Demo only
                  </Typography>
                  {[
                    ["Subtotal", totals?.subtotal],
                    ["Discount", totals?.discountAmount],
                    ["Taxable amount", totals?.taxableAmount],
                    ["Tax", totals?.taxAmount],
                  ].map(([label, value]) => (
                    <Stack
                      key={label}
                      direction="row"
                      justifyContent="space-between"
                    >
                      <Typography>{label}</Typography>
                      <Typography>{value ?? "Unknown"}</Typography>
                    </Stack>
                  ))}
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="h3">Total</Typography>
                    <Typography variant="h3">
                      {totals?.total ?? "Unknown"}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {dirty
                      ? "Preview only; save for authoritative server totals."
                      : `Server-confirmed total: ${
                          quote.totals?.total ?? "Unknown"
                        }`}
                  </Typography>
                </Stack>
              </Panel>
              <Panel title="Price review">
                <Stack spacing={2}>
                  <Typography color="text.secondary">
                    Discounts above 5% require another authorized Sales Head.
                    Approval applies only to the saved revision and scope.
                  </Typography>
                  {quote.approval && (
                    <StatusBadge label={quote.approval.status} />
                  )}
                  <Button
                    variant="outlined"
                    disabled={
                      dirty ||
                      command.busy ||
                      p.archived ||
                      quote.currentness !== "Current" ||
                      !quote.totals
                    }
                    onClick={() =>
                      setDialog({
                        title: "Submit price review?",
                        description: `Submit quote revision ${quote.revision} for review. Any later pricing or scope edits invalidate this approval.`,
                        label: "Submit price review",
                        reason: true,
                        onConfirm: (reason) =>
                          command.run("requestPriceApproval", { reason }),
                      })
                    }
                  >
                    Request price review
                  </Button>
                  {context.canApprove &&
                    quote.approval?.status === "Pending" &&
                    quote.approval.requesterId !== context.actorId && (
                      <>
                        <Button
                          variant="contained"
                          onClick={() =>
                            setDialog({
                              title: "Approve this price revision?",
                              description: `Approve quote revision ${quote.revision} with its current terms.`,
                              label: "Approve pricing",
                              reason: true,
                              onConfirm: (note) =>
                                command.run("reviewPriceApproval", {
                                  approved: true,
                                  note,
                                }),
                            })
                          }
                        >
                          Approve pricing
                        </Button>
                        <Button
                          color="error"
                          disabled={p.archived || command.busy}
                          onClick={() =>
                            setDialog({
                              title: "Decline price review?",
                              description: `Decline quote revision ${quote.revision}.`,
                              label: "Decline pricing",
                              reason: true,
                              onConfirm: (note) =>
                                command.run("reviewPriceApproval", {
                                  approved: false,
                                  note,
                                }),
                            })
                          }
                        >
                          Decline pricing
                        </Button>
                      </>
                    )}
                </Stack>
              </Panel>
              <NextLink to={`/quotes/${p.id}/approval`}>
                Review saved pricing and history
              </NextLink>
              <Panel title="Customer proposal">
                <Typography color="text.secondary" mb={2}>
                  Create a customer-safe snapshot without internal costs, margin
                  or private approval notes.
                </Typography>
                <Button
                  variant="contained"
                  disabled={
                    dirty ||
                    command.busy ||
                    p.archived ||
                    quote.currentness !== "Current" ||
                    !quote.totals
                  }
                  onClick={() => {
                    void command.run("createProposalSnapshot").catch(() => {});
                  }}
                >
                  Create proposal snapshot
                </Button>
                {p.proposals.map((s) => (
                  <Button
                    key={s.id}
                    component={RouterLink}
                    to={`/projects/${p.id}/proposals/${s.id}`}
                  >
                    Open proposal · quote v{s.quote.revision}
                  </Button>
                ))}
              </Panel>
            </Stack>
          </Box>
        </>
      )}
      <CommandDialog spec={dialog} close={() => setDialog(null)} />
    </PageContainer>
  );
}
export function Proposal() {
  const { projectId, proposalId } = useParams();
  const query = useWorkflow<HmgProject["proposals"][number]>(
    "getProposal",
    projectId,
    { proposalId }
  );
  const project = useWorkflow<HmgProject>("getProject", projectId);
  const p = query.data;
  return (
    <PageContainer className="proposal-page">
      <Box className="proposal-screen-only">
        <Crumbs project={projectId} current="Customer proposal" />
        <PageHeading
          eyebrow="HMG Stones / Customer proposal"
          title="Your space, considered"
          action={
            <Button onClick={() => window.print()} variant="outlined">
              Print proposal
            </Button>
          }
        />
        <Alert severity="info" sx={{ mb: 3 }}>
          {DEMO_LABEL}
        </Alert>
      </Box>
      {query.loading ? (
        <LoadingState />
      ) : query.error || !p ? (
        <LoadError retry={() => query.refetch()} />
      ) : (
        <ProposalPrintDocument
          project={project.data}
          proposal={p}
          onPrint={() => window.print()}
        />
      )}
    </PageContainer>
  );
}

function ProposalPrintDocument({
  project,
  proposal,
  onPrint,
}: {
  project?: HmgProject;
  proposal: HmgProject["proposals"][number];
  onPrint: () => void;
}) {
  const quote = proposal.quote;
  const money = (amount?: string | null, currency = quote.lines[0]?.currency || "INR") => {
    if (amount == null || !/^\d+(\.\d+)?$/.test(amount)) return "Not confirmed";
    return `${currency} ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))}`;
  };
  const quantity = (value?: string | null) => {
    if (value == null || !/^\d+(\.\d+)?$/.test(value)) return "Not confirmed";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value));
  };
  return (
    <Box
      className="proposal-print-document"
      sx={{
        bgcolor: "background.paper", color: "text.primary", border: 1,
        borderColor: "divider", borderRadius: 1, p: { xs: 2, md: 4 },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box>
          <Typography sx={{ fontFamily: "Georgia, serif", fontSize: 24, letterSpacing: ".08em", lineHeight: 1 }}>HMG <Box component="span" sx={{ fontFamily: "inherit", fontSize: 11, letterSpacing: ".22em" }}>STONES</Box></Typography>
          <Typography variant="caption" color="text.secondary">NATURAL STONE · CUSTOMER PROPOSAL</Typography>
        </Box>
        <Box textAlign="right">
          <Typography variant="overline">Proposal reference</Typography>
          <Typography variant="body2">{proposal.id}</Typography>
          <Typography variant="body2">Revision {quote.revision} · Selection v{quote.selectionVersion}</Typography>
        </Box>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2} sx={{ py: 3 }}>
        <Box>
          <Typography variant="overline">PREPARED FOR PROJECT</Typography>
          <Typography variant="h2">{project?.name || "Project details unavailable"}</Typography>
          <Typography color="text.secondary">{project?.brief?.room || "Room not specified"} · {project?.brief?.application || "Application not specified"}</Typography>
        </Box>
        <Box textAlign={{ sm: "right" }}>
          <Typography variant="overline">PROPOSAL DATE</Typography>
          <Typography>{new Date(proposal.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</Typography>
          <Typography variant="body2">Status: {proposal.currentness || "Saved snapshot"}</Typography>
        </Box>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        Illustrative proposal based on the saved quote snapshot. Demo rates only; not an invoice, order, stock reservation, or binding offer.
      </Alert>
      {proposal.currentness === "Stale" && (
        <Alert severity="warning" className="proposal-screen-only" sx={{ mb: 2 }}>
          This historical snapshot no longer reflects the current selection or price. <Button component={RouterLink} to={`/projects/${quote.projectId}/review`}>Review current selection</Button>
          {project?.latestProposalId && project.latestProposalId !== proposal.id && <Button component={RouterLink} to={`/projects/${quote.projectId}/proposals/${project.latestProposalId}`}>Latest proposal snapshot</Button>}
        </Alert>
      )}

      <Typography variant="h3" sx={{ mt: 2, mb: 1.5 }}>Itemized estimate</Typography>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" className="proposal-print-table" aria-label="Itemized proposal pricing">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "31%" }}>Material / scope</TableCell>
              <TableCell align="right" sx={{ width: "11%" }}>Qty</TableCell>
              <TableCell align="right" sx={{ width: "15%" }}>Rate / unit</TableCell>
              <TableCell align="right" sx={{ width: "10%" }}>Allow.</TableCell>
              <TableCell align="right" sx={{ width: "10%" }}>Disc.</TableCell>
              <TableCell align="right" sx={{ width: "8%" }}>Tax</TableCell>
              <TableCell align="right" sx={{ width: "15%" }}>Line total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quote.lines.map((line) => {
              const lineTotals = calculatePreview([line]);
              return (
                <TableRow key={line.id} className="proposal-print-row">
                  <TableCell sx={{ verticalAlign: "top", overflowWrap: "anywhere" }}>
                    <Typography variant="body2" fontWeight={700}>{line.description}</Typography>
                    {line.source?.title && line.source.title !== line.description && <Typography variant="caption" color="text.secondary" display="block">Stone: {line.source.title}</Typography>}
                  </TableCell>
                  <TableCell align="right">{quantity(line.quantity)}<Typography component="span" variant="caption"> {line.unit}</Typography>{lineTotals && <Typography component="span" variant="caption" display="block">Billable: {quantity(lineTotals.billableQuantity)} {line.unit}</Typography>}</TableCell>
                  <TableCell align="right">{money(line.rate, line.currency)}<Typography component="span" variant="caption" display="block">per {line.unit}</Typography></TableCell>
                  <TableCell align="right">{quantity(line.allowancePct)}%</TableCell>
                  <TableCell align="right">{quantity(line.discountPct)}%</TableCell>
                  <TableCell align="right">{quantity(line.taxPct)}%</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{lineTotals ? money(lineTotals.total, line.currency) : "Not confirmed"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
        <Box sx={{ width: { xs: "100%", sm: 360 } }}>
          <ProposalTotal label="Billable quantity" value={`${quantity(quote.totals?.billableQuantity)} ${quote.lines[0]?.unit || ""}`} />
          <ProposalTotal label="Subtotal" value={money(quote.totals?.subtotal)} />
          <ProposalTotal label="Discount" value={money(quote.totals?.discountAmount)} />
          <ProposalTotal label="Taxable amount" value={money(quote.totals?.taxableAmount)} />
          <ProposalTotal label="Illustrative tax" value={money(quote.totals?.taxAmount)} />
          <ProposalTotal label="Total estimate" value={money(quote.totals?.total)} strong />
        </Box>
      </Box>

      <Box className="proposal-print-section" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mt: 4 }}>
        <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="h3" mb={1}>Assumptions</Typography>
          <Typography variant="body2">{quote.assumptions.join(" · ") || "No assumptions recorded."}</Typography>
        </Box>
        <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="h3" mb={1}>Exclusions</Typography>
          <Typography variant="body2">{quote.exclusions.join(" · ") || "No exclusions recorded."}</Typography>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}>
        Estimate only. Final quantities, application suitability, slab selection, stock availability, delivery, installation, and commercial terms require separate verification. No order or stock reservation is created by this proposal.
      </Typography>
      <Stack direction="row" justifyContent="flex-end" className="proposal-screen-only" sx={{ mt: 2 }}>
        <Button variant="contained" onClick={onPrint}>Print / Save as PDF</Button>
      </Stack>
    </Box>
  );
}

function ProposalTotal({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} sx={{ py: 0.75, borderBottom: 1, borderColor: "divider", ...(strong ? { fontWeight: 700, borderBottom: 2 } : {}) }}>
      <Typography variant={strong ? "h3" : "body2"}>{label}</Typography>
      <Typography variant={strong ? "h3" : "body2"} textAlign="right">{value}</Typography>
    </Stack>
  );
}

/** Separate saved-revision approval, never an editable pricing form. */
export function PriceApproval() {
  const { quoteId } = useParams();
  const context = useWorkspace();
  const query = useWorkflow<HmgProject>(
    "getSalesProject",
    quoteId,
    undefined,
    !!context?.canPrice
  );
  const project = query.data;
  const quote = project?.quote;
  const command = useProjectCommand(project, query.refetch);
  const [dialog, setDialog] = useState<CommandDialogSpec | null>(null);
  if (!context?.canPrice)
    return (
      <PageContainer>
        <EmptyState title="Quote staff access required" />
      </PageContainer>
    );
  if (query.loading)
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  if (query.error || !project)
    return (
      <PageContainer>
        <LoadError retry={query.refetch} />
      </PageContainer>
    );
  if (!quote)
    return (
      <PageContainer>
        <EmptyState
          title="No saved quote to review"
          action={
            <NextLink to={`/quotes/${quoteId}`}>Open quote desk</NextLink>
          }
        />
      </PageContainer>
    );
  const approval = quote.approval;
  const eligible =
    context.canApprove &&
    approval?.status === "Pending" &&
    approval.requesterId !== context.actorId &&
    quote.currentness === "Current" &&
    !project.archived;
  const review = (approved: boolean) =>
    setDialog({
      title: approved
        ? "Approve this saved revision?"
        : "Decline this saved revision?",
      description: `Review quote revision ${quote.revision}, selection v${quote.selectionVersion}. Price review is not technical clearance or an order.`,
      label: approved ? "Approve pricing" : "Decline pricing",
      reason: true,
      onConfirm: (note) =>
        command.run("reviewPriceApproval", { approved, note }, project.version),
    });
  return (
    <PageContainer>
      <Crumbs
        project={project.id}
        name={project.name}
        current="Price approval"
      />
      <PageHeading
        eyebrow="Saved revision / Price approval"
        title={`Price review for ${project.name}`}
        action={
          <NextLink to={`/quotes/${quoteId}`}>Open quote editor</NextLink>
        }
      />
      <Stack direction="row" gap={1} mb={3}>
        <StatusBadge label={approval?.status || quote.pricingStatus} />
        <Chip label={`Quote r${quote.revision}`} />
        <Chip label={`Selection v${quote.selectionVersion}`} />
        <StatusBadge
          label={quote.currentness}
          warning={quote.currentness !== "Current"}
        />
      </Stack>
      <Alert severity="info">
        {quote.source?.kind === "studio" ? "Staff-entered official-material rates" : "Fictional rates"}. Illustrative tax / Demo only. Approval is bound to this saved revision and does not verify application suitability.
      </Alert>
      {command.error && (
        <Alert severity="error">
          {command.error}
          <Button onClick={() => query.refetch()}>
            Refresh saved revision
          </Button>
        </Alert>
      )}
      <ConflictRecovery
        version={command.conflictVersion}
        refresh={query.refreshValue}
        onRebase={(version) => {
          command.rebase(version);
          setDialog(null);
        }}
      />
      <Box sx={{ ...columnGrid, mt: 3 }}>
        <Panel title="Saved price summary">
          <SavedQuoteSummary quote={quote} />
        </Panel>
        <Panel title="Review & audit">
          <Typography>
            Request reason: {approval?.reason || "No request recorded"}
          </Typography>
          <Typography>
            Requested: {approval?.requestedAt || "Not recorded"}
          </Typography>
          <Typography>
            Reviewed: {approval?.reviewedAt || "Not reviewed"}
          </Typography>
          <Typography>
            Reviewer role: {approval?.reviewerRole || "Not reviewed"}
          </Typography>
          <Typography>
            Review note: {approval?.note || "None recorded"}
          </Typography>
          {eligible ? (
            <Stack direction="row" gap={2} mt={2}>
              <Button
                disabled={command.busy}
                variant="contained"
                onClick={() => review(true)}
              >
                Approve pricing
              </Button>
              <Button
                disabled={command.busy}
                color="error"
                onClick={() => review(false)}
              >
                Decline pricing
              </Button>
            </Stack>
          ) : (
            <Alert severity="info" sx={{ mt: 2 }}>
              Only a different authorized Sales Head can review a pending,
              current revision. Archived projects cannot be changed.
            </Alert>
          )}
        </Panel>
      </Box>
      <Panel title={`Revision history (${project.quoteHistory?.length || 0})`}>
        {(project.quoteHistory || []).map((item, i) => (
          <Typography key={`${item.revision}-${i}`}>
            Revision {item.revision} · Selection v{item.selectionVersion} ·{" "}
            {item.pricingStatus} · INR {item.totals?.total || "Unknown"}
          </Typography>
        ))}
      </Panel>
      <CommandDialog spec={dialog} close={() => setDialog(null)} />
    </PageContainer>
  );
}

function SavedQuoteSummary({ quote }: { quote: HmgQuote }) {
  return (
    <Stack spacing={3}>
      {quote.lines.map((l) => (
        <Box key={l.id}>
          <Typography variant="h3">{l.description}</Typography>
          <Typography color="text.secondary">
            {l.quantity || "Unknown quantity"} {l.unit} · Allowance{" "}
            {l.allowancePct}% · {l.currency} {l.rate || "Unknown rate"} per{" "}
            {l.unit} · Discount {l.discountPct}% · Tax {l.taxPct}%
          </Typography>
        </Box>
      ))}
      <Divider />
      <Typography variant="h2">
        {quote.lines[0]?.currency}{" "}
        {quote.totals?.total || "Total not confirmed"}
      </Typography>
      <Typography>Tax: {quote.totals?.taxAmount || "Unknown"}</Typography>
      <Typography>
        Assumptions: {quote.assumptions.join("; ") || "None recorded"}
      </Typography>
      <Typography>
        Exclusions: {quote.exclusions.join("; ") || "None recorded"}
      </Typography>
      <Alert severity="warning">
        Subject to verified measurement, application checks, exact-slab review
        and availability. This is a demo proposal, not an order or binding
        acceptance.
      </Alert>
    </Stack>
  );
}
