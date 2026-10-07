import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField,
  Typography,
} from "@mui/material";
import { useNotification } from "@refinedev/core";
import { PageContainer } from "../../components";
import { useWorkflow, workflow } from "../../features/hmg/api";
import type { HmgLeadInput, HmgProject, HmgSalesLead, HmgSalesPipelineSummary, HmgSalesStage } from "../../features/hmg/types";
import { HMG_SALES_STAGES } from "../../features/hmg/types";
import { ConflictRecovery, EmptyState, LoadError, LoadingState, PageHeading, Panel, StatusBadge } from "../../features/hmg/components/common";
import { useWorkspace } from "../../features/hmg/components/AppShell";
import { hasCurrentProposal, permittedSalesStageMoves } from "./sales-stage";

const pageSizeValues = [10, 20, 50, 100];
const terminalStages = new Set<HmgSalesStage>(["Won", "Declined"]);
type SalesPipelineData = HmgSalesPipelineSummary & { salesOwnerOptions?: Array<{ id: string; label: string }> };

function useStableCommandKeys() {
  const pending = useRef(new Map<string, { signature: string; key: string }>());
  const keyFor = (scope: string, signature: unknown) => {
    const serialized = JSON.stringify(signature);
    const existing = pending.current.get(scope);
    if (existing?.signature === serialized) return existing.key;
    const key = crypto.randomUUID();
    pending.current.set(scope, { signature: serialized, key });
    return key;
  };
  const clear = (scope: string, signature: unknown) => {
    if (pending.current.get(scope)?.signature === JSON.stringify(signature)) pending.current.delete(scope);
  };
  return { keyFor, clear };
}

type LeadDraft = {
  name: string; room: string; application: string; quantity: string;
  requirements: string; source: string; salesOwnerId: string; contactName: string;
  contactChannel: HmgLeadInput["contactChannel"]; contactDetail: string; notes: string;
};
const blankDraft = (): LeadDraft => ({
  name: "", room: "", application: "", quantity: "", requirements: "",
  source: "", salesOwnerId: "", contactName: "", contactChannel: "", contactDetail: "", notes: "",
});

export function SalesPipeline() {
  const context = useWorkspace();
  const [params, setParams] = useSearchParams();
  const canSales = context?.canSales === true;
  const stage = HMG_SALES_STAGES.includes(params.get("stage") as HmgSalesStage)
    ? params.get("stage") as HmgSalesStage : "all";
  const archived = ["active", "archived", "all"].includes(params.get("archived") || "")
    ? params.get("archived") || "active" : "active";
  const search = params.get("q") || "";
  const pageValue = Number(params.get("page"));
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const sizeValue = Number(params.get("size"));
  const pageSize = pageSizeValues.includes(sizeValue) ? sizeValue : 10;
  const [searchInput, setSearchInput] = useState(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<LeadDraft>(() => blankDraft());
  const createAttemptKey = useRef<string>();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [selected, setSelected] = useState<HmgSalesLead | null>(null);
  const [targetStage, setTargetStage] = useState<HmgSalesStage | "">("");
  const [declineReason, setDeclineReason] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [transitionConfirmOpen, setTransitionConfirmOpen] = useState(false);
  const [transitionError, setTransitionError] = useState("");
  const [conflictVersion, setConflictVersion] = useState<number>();
  const [conflictAction, setConflictAction] = useState<"edit" | "transition">();
  const reviewedProject = useRef<HmgProject>();
  const [reviewedSales, setReviewedSales] = useState<{ sales?: HmgSalesLead["sales"]; salesOwnerId?: string | null }>();
  const [edits, setEdits] = useState({ source: "", contactName: "", contactChannel: "" as HmgLeadInput["contactChannel"], contactDetail: "", notes: "", salesOwnerId: "" });
  const [savingNotes, setSavingNotes] = useState(false);
  const [detailError, setDetailError] = useState("");
  const { open } = useNotification();
  const commandKeys = useStableCommandKeys();

  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => setParams((old) => {
      const next = new URLSearchParams(old);
      searchInput ? next.set("q", searchInput) : next.delete("q");
      next.delete("page");
      return next;
    }), 350);
    return () => clearTimeout(timer);
  }, [searchInput, search, setParams]);

  const payload = useMemo(() => ({ search, stage, archived, page, pageSize }), [search, stage, archived, page, pageSize]);
  const query = useWorkflow<SalesPipelineData>("listSalesPipeline", undefined, payload, canSales);
  const ownerOptions = query.data?.salesOwnerOptions || [];
  const ownerLabel = (id?: string | null) => !id ? "Unassigned" : ownerOptions.find((owner) => owner.id === id)?.label || (id === context?.actorId ? "Current user" : "Unavailable owner");
  const defaultOwner = ownerOptions.find((owner) => owner.id === context?.actorId)?.id || ownerOptions[0]?.id || "";

  const setFilter = (key: string, value: string) => setParams((old) => {
    const next = new URLSearchParams(old);
    if (key === "stage" && value === "all") next.set(key, "all");
    else value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    return next;
  });
  const clearFilters = () => { setSearchInput(""); setParams({}); };

  if (!canSales) return <PageContainer><EmptyState title="Staff access required" description="Sales pipeline and lead contact information are available only to authorized HMG sales staff." /></PageContainer>;

  const hasFilters = !!search || stage !== "all" || archived !== "active";
  const counts = query.data?.counts;
  const updateDraft = (field: keyof LeadDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const createLead = async () => {
    if (!draft.name.trim() || !draft.room.trim() || !draft.application.trim() || !draft.source.trim()) return;
    setCreating(true); setCreateError("");
    const leadInput: HmgLeadInput = {
      name: draft.name.trim(),
      brief: { room: draft.room.trim(), application: draft.application.trim(), quantity: draft.quantity.trim(), unit: "sq ft", priorities: [], requirements: draft.requirements.trim() },
      source: draft.source.trim(),
      salesOwnerId: draft.salesOwnerId || context?.actorId || "",
      ...(draft.contactName.trim() ? { contactName: draft.contactName.trim() } : {}),
      ...(draft.contactChannel ? { contactChannel: draft.contactChannel } : {}),
      ...(draft.contactDetail.trim() ? { contactDetail: draft.contactDetail.trim() } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
    try {
      const idempotencyKey = createAttemptKey.current || (createAttemptKey.current = crypto.randomUUID());
      await workflow<HmgSalesLead>({ command: "createLead", idempotencyKey, payload: leadInput as unknown as Record<string, unknown> });
      createAttemptKey.current = undefined;
      setCreateOpen(false); setDraft({ ...blankDraft(), salesOwnerId: defaultOwner });
      open?.({ type: "success", message: "Lead saved", description: "Confirmed by the HMG workspace." });
      try { await query.refetch(); }
      catch { open?.({ type: "error", message: "Lead saved; refresh incomplete", description: "The server confirmed the lead, but the pipeline list could not be refreshed. Retry the list refresh, not lead creation." }); }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Lead could not be saved. Retry after refreshing.");
    } finally { setCreating(false); }
  };
  const openDetail = (lead: HmgSalesLead) => { setSelected(lead); setEdits({ source: lead.sales?.source || "", contactName: lead.sales?.contactName || "", contactChannel: lead.sales?.contactChannel || "", contactDetail: lead.sales?.contactDetail || "", notes: lead.sales?.notes || "", salesOwnerId: lead.salesOwnerId || "" }); setDetailError(""); setTargetStage(""); setDeclineReason(""); setTransitionConfirmOpen(false); setConflictVersion(undefined); setConflictAction(undefined); setReviewedSales(undefined); };
  const refreshConflict = async (): Promise<HmgProject> => {
    if (!selected) throw new Error("Select an opportunity before reviewing its conflict.");
    const latest = await workflow<HmgProject>({ command: "getSalesProject", projectId: selected.id });
    reviewedProject.current = latest;
    const salesSnapshot = latest as HmgProject & Partial<Pick<HmgSalesLead, "sales" | "salesOwnerId">>;
    setReviewedSales({ sales: salesSnapshot.sales, salesOwnerId: salesSnapshot.salesOwnerId });
    return latest;
  };
  const applyReviewedConflict = (version: number) => {
    const latest = reviewedProject.current;
    if (!selected || !latest || latest.id !== selected.id || latest.version !== version) throw new Error("Refresh and review the latest revision before retrying.");
    setSelected(latest as HmgSalesLead);
    if (conflictAction === "transition") { setTransitionError(""); setTransitionConfirmOpen(true); }
    else setDetailError("");
    setReviewedSales(undefined);
    setConflictVersion(undefined);
    setConflictAction(undefined);
  };
  const saveNotes = async () => {
    if (!selected) return;
    if (!edits.source.trim()) { setDetailError("Lead source is required."); return; }
    setSavingNotes(true); setDetailError("");
    const updatePayload = { source: edits.source.trim(), contactName: edits.contactName, contactChannel: edits.contactChannel || "", contactDetail: edits.contactDetail, notes: edits.notes, ...(ownerChanged ? { salesOwnerId: edits.salesOwnerId } : {}) };
    const signature = { projectId: selected.id, expectedVersion: selected.version, payload: updatePayload };
    const scope = `updateLead:${selected.id}`;
    try {
      const updated = await workflow<HmgSalesLead>({ command: "updateLead", projectId: selected.id, expectedVersion: selected.version, idempotencyKey: commandKeys.keyFor(scope, signature), payload: updatePayload });
      commandKeys.clear(scope, signature);
      setSelected(updated); setConflictVersion(undefined); setConflictAction(undefined); await query.refetch();
      open?.({ type: "success", message: "Lead updated", description: "The latest saved lead details are now shown." });
    } catch (error) { const failure = error as { code?: string; currentVersion?: number }; if (failure?.code === "CONFLICT") { setConflictVersion(failure.currentVersion ?? selected.version); setConflictAction("edit"); } setDetailError(error instanceof Error ? error.message : "Lead update could not be saved."); }
    finally { setSavingNotes(false); }
  };
  const transition = async () => {
    if (!selected || !targetStage || (targetStage === "Declined" && !declineReason.trim())) return;
    setTransitioning(true); setTransitionError("");
    try {
      const transitionPayload = { stage: targetStage, ...(targetStage === "Declined" ? { reason: declineReason.trim() } : {}) };
      const signature = { projectId: selected.id, expectedVersion: selected.version, payload: transitionPayload };
      const scope = `transitionSalesStage:${selected.id}`;
      const updated = await workflow<HmgSalesLead>({
        command: "transitionSalesStage", projectId: selected.id, expectedVersion: selected.version,
        idempotencyKey: commandKeys.keyFor(scope, signature),
        payload: transitionPayload,
      });
      commandKeys.clear(scope, signature);
      setSelected(updated); setTargetStage(""); setDeclineReason(""); setTransitionConfirmOpen(false); setConflictVersion(undefined); setConflictAction(undefined); await query.refetch();
      open?.({ type: "success", message: `Moved to ${updated.stage}`, description: "The persisted sales stage and pipeline counts were refreshed." });
    } catch (error) { const failure = error as { code?: string; currentVersion?: number }; if (failure?.code === "CONFLICT") { setConflictVersion(failure.currentVersion ?? selected.version); setConflictAction("transition"); setTransitionConfirmOpen(false); } setTransitionError(error instanceof Error ? error.message : "Stage change could not be saved."); }
    finally { setTransitioning(false); }
  };
  const ownerChanged = !!selected && edits.salesOwnerId !== (selected.salesOwnerId || "") && ownerOptions.some((owner) => owner.id === edits.salesOwnerId);

  return <PageContainer>
    <PageHeading eyebrow="Sales Workspace / Lead pipeline" title="Sales pipeline" description="Capture fictional leads, qualify opportunities, and track each persisted stage through a decision. No orders or messages are sent." action={<Button variant="contained" onClick={() => { if (!createAttemptKey.current) setDraft({ ...blankDraft(), salesOwnerId: defaultOwner }); setCreateError(""); setCreateOpen(true); }}>New lead</Button>} />
    {query.fetching && !query.loading && <Alert severity="info" sx={{ mb: 2 }}>Refreshing persisted pipeline…</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 1.5, mb: 3 }} aria-label="Sales stage totals">
      {HMG_SALES_STAGES.map((name) => <Panel key={name}><Typography variant="body2" color="text.secondary">{name}</Typography><Typography variant="h3">{counts && Number.isFinite(counts[name]) ? counts[name] : query.loading ? "—" : "Unavailable"}</Typography></Panel>)}
    </Box>
    <Panel title="Leads and opportunities">
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} mb={2}>
        <TextField label="Search leads" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} sx={{ flex: 1 }} />
        <TextField select label="Sales stage" value={stage} onChange={(event) => setFilter("stage", event.target.value)} sx={{ minWidth: 190 }}>
          <MenuItem value="all">All sales stages</MenuItem>{HMG_SALES_STAGES.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
        <TextField select label="Visibility" value={archived} onChange={(event) => setFilter("archived", event.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="active">Active</MenuItem><MenuItem value="archived">Archived</MenuItem><MenuItem value="all">All</MenuItem>
        </TextField>
      </Stack>
      <Stack direction="row" gap={1} flexWrap="wrap" mb={2} aria-label="Active filters">
        {search && <Chip variant="outlined" label={`Search: ${search}`} onDelete={() => setFilter("q", "")} />}
        {stage !== "all" && <Chip variant="outlined" label={`Stage: ${stage}`} onDelete={() => setFilter("stage", "all")} />}
        {archived !== "active" && <Chip variant="outlined" label={`Visibility: ${archived}`} onDelete={() => setFilter("archived", "active")} />}
        {hasFilters && <Button size="small" onClick={clearFilters}>Clear all</Button>}
      </Stack>
      {query.loading ? <LoadingState /> : query.error ? <LoadError retry={() => query.refetch()} /> : !query.data?.data.length ? (
        <EmptyState title={search ? "No results found" : hasFilters ? "No matching items" : "No leads yet"} description={hasFilters ? "Adjust your search or filters to see other opportunities." : "Create a fictional lead to begin the HMG sales workflow."} action={hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : <Button variant="contained" onClick={() => { if (!createAttemptKey.current) setDraft({ ...blankDraft(), salesOwnerId: defaultOwner }); setCreateOpen(true); }}>Create lead</Button>} />
      ) : <TableContainer><Table aria-label="Sales pipeline leads"><TableHead><TableRow><TableCell>Opportunity</TableCell><TableCell>Stage</TableCell><TableCell>Source</TableCell><TableCell>Sales owner</TableCell><TableCell align="right">Selection</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>
        {query.data.data.map((lead) => <TableRow key={lead.id} hover>
          <TableCell><Typography>{lead.name}</Typography><Typography variant="body2" color="text.secondary">{lead.brief.room} · {lead.brief.application}</Typography></TableCell>
          <TableCell><StatusBadge label={lead.archived ? "Archived" : lead.stage} /></TableCell>
          <TableCell>{lead.sales?.source || "—"}</TableCell><TableCell>{ownerLabel(lead.salesOwnerId)}</TableCell><TableCell align="right">v{lead.selectionVersion}</TableCell>
          <TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={1}>
            <Button onClick={() => openDetail(lead)}>Lead details</Button>
            {lead.stage !== "Lead" && <Button component={RouterLink} to={`/sales/projects/${encodeURIComponent(lead.id)}`}>Open project</Button>}
          </Stack></TableCell>
        </TableRow>)}
      </TableBody></Table></TableContainer>}
      <TablePagination component="div" count={query.data?.total || 0} page={page - 1} rowsPerPage={pageSize} rowsPerPageOptions={pageSizeValues} onPageChange={(_, nextPage) => setParams((old) => { const next = new URLSearchParams(old); next.set("page", String(nextPage + 1)); return next; })} onRowsPerPageChange={(event) => setParams((old) => { const next = new URLSearchParams(old); next.set("size", event.target.value); next.delete("page"); return next; })} />
    </Panel>

    <Dialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} fullWidth maxWidth="md" aria-labelledby="create-lead-title">
      <DialogTitle id="create-lead-title">Create a fictional lead</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1, pr: 1, overflowWrap: "anywhere" }}>
        <Alert severity="info">Sample lead data only. Contact fields are staff-only; this does not send a message or create an order.</Alert>
        {createError && <Alert severity="error">{createError}</Alert>}
        {!ownerOptions.length && <Alert severity="warning">Authorized owner choices are unavailable. Refresh the pipeline before creating a lead.</Alert>}
        <TextField required label="Project name" value={draft.name} onChange={(e) => updateDraft("name", e.target.value)} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField required label="Room type" value={draft.room} onChange={(e) => updateDraft("room", e.target.value)} fullWidth /><TextField required label="Application" value={draft.application} onChange={(e) => updateDraft("application", e.target.value)} fullWidth /></Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField label="Approx. area (sq ft)" value={draft.quantity} onChange={(e) => updateDraft("quantity", e.target.value)} fullWidth /><TextField required label="Source" value={draft.source} onChange={(e) => updateDraft("source", e.target.value)} fullWidth /></Stack>
        <TextField select required label="Assigned sales owner" value={ownerOptions.some((owner) => owner.id === draft.salesOwnerId) ? draft.salesOwnerId : ""} onChange={(e) => updateDraft("salesOwnerId", e.target.value)} disabled={!ownerOptions.length}>{ownerOptions.map((owner) => <MenuItem value={owner.id} key={owner.id}>{owner.label}</MenuItem>)}</TextField>
        <TextField label="Brief / requirements" multiline minRows={2} value={draft.requirements} onChange={(e) => updateDraft("requirements", e.target.value)} />
        <Divider /><Typography variant="h3">Optional fictional contact (staff-only)</Typography>
        <TextField label="Contact name" value={draft.contactName} onChange={(e) => updateDraft("contactName", e.target.value)} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField select label="Contact channel" value={draft.contactChannel || ""} onChange={(e) => updateDraft("contactChannel", e.target.value)} fullWidth><MenuItem value="">Not recorded</MenuItem>{["Email", "Phone", "Showroom", "Referral", "Other"].map((channel) => <MenuItem key={channel} value={channel}>{channel}</MenuItem>)}</TextField><TextField label="Contact detail" value={draft.contactDetail} onChange={(e) => updateDraft("contactDetail", e.target.value)} fullWidth /></Stack>
        <TextField label="Private sales notes" multiline minRows={2} value={draft.notes} onChange={(e) => updateDraft("notes", e.target.value)} />
      </Stack></DialogContent><DialogActions><Button variant="outlined" disabled={creating} onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="contained" disabled={creating || !draft.name.trim() || !draft.room.trim() || !draft.application.trim() || !draft.source.trim() || !ownerOptions.some((owner) => owner.id === draft.salesOwnerId)} onClick={() => void createLead()}>{creating ? "Saving…" : "Create lead"}</Button></DialogActions>
    </Dialog>

    <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="md" aria-labelledby="lead-details-title">
      {selected && <><DialogTitle id="lead-details-title">{selected.name}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1, pr: 1, overflowWrap: "anywhere" }}>
        {detailError && <Alert severity="error">{detailError}</Alert>}
        {conflictAction && <><Alert severity="warning">A newer revision exists. Review it before retrying. {conflictAction === "edit" ? "Your field edits are retained." : "The selected stage and decline reason are retained; the stage must be confirmed again."} The review does not save anything.</Alert><ConflictRecovery version={conflictVersion} refresh={refreshConflict} onRebase={applyReviewedConflict} extraContent={<Box><Typography variant="h3">Latest sales details</Typography><Typography>Sales source: {reviewedSales?.sales?.source || "Not recorded"}</Typography><Typography>Contact: {reviewedSales?.sales?.contactName || "Not recorded"}</Typography><Typography>Contact channel/detail: {reviewedSales?.sales?.contactChannel || "Not recorded"} / {reviewedSales?.sales?.contactDetail || "Not recorded"}</Typography><Typography>Private notes: {reviewedSales?.sales?.notes || "None"}</Typography><Typography>Owner: {ownerLabel(reviewedSales?.salesOwnerId)}</Typography></Box>} /></>}
        {!ownerOptions.length && <Alert severity="warning">Authorized owner choices are unavailable. Owner assignment is disabled; other lead details can still be saved.</Alert>}
        <Stack direction="row" gap={1} flexWrap="wrap"><StatusBadge label={selected.archived ? "Archived" : selected.stage} /><Chip label={`Revision ${selected.version}`} /><Chip label="Fictional opportunity" variant="outlined" /></Stack>
        <Typography variant="h3">Opportunity overview</Typography>
        <Typography>{selected.brief.room} · {selected.brief.application} · {selected.brief.quantity || "Area not recorded"} {selected.brief.unit}</Typography>
        <Typography variant="body2" color="text.secondary">Source: {selected.sales?.source || "—"} · Owner: {ownerLabel(selected.salesOwnerId)}</Typography>
        <Divider /><Typography variant="h3">Contact and sales details</Typography>
        <Typography>{selected.sales?.contactName || "Name not recorded"} · {selected.sales?.contactChannel || "Channel not recorded"} · {selected.sales?.contactDetail || "Contact detail not recorded"}</Typography>
        {selected.sales?.declineReason && <Alert severity="info">Decline reason: {selected.sales.declineReason}</Alert>}
        <TextField label="Sales source" value={edits.source} onChange={(e) => setEdits((current) => ({ ...current, source: e.target.value }))} disabled={terminalStages.has(selected.stage) || selected.archived} />
        <TextField label="Contact name" value={edits.contactName} onChange={(e) => setEdits((current) => ({ ...current, contactName: e.target.value }))} disabled={terminalStages.has(selected.stage) || selected.archived} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField select label="Contact channel" value={edits.contactChannel || ""} onChange={(e) => setEdits((current) => ({ ...current, contactChannel: e.target.value as HmgLeadInput["contactChannel"] }))} fullWidth disabled={terminalStages.has(selected.stage) || selected.archived}><MenuItem value="">Not recorded</MenuItem>{["Email", "Phone", "Showroom", "Referral", "Other"].map((channel) => <MenuItem key={channel} value={channel}>{channel}</MenuItem>)}</TextField><TextField label="Contact detail" value={edits.contactDetail} onChange={(e) => setEdits((current) => ({ ...current, contactDetail: e.target.value }))} fullWidth disabled={terminalStages.has(selected.stage) || selected.archived} /></Stack>
        <TextField select label="Assigned sales owner" value={edits.salesOwnerId} onChange={(e) => setEdits((current) => ({ ...current, salesOwnerId: e.target.value }))} disabled={!ownerOptions.length || terminalStages.has(selected.stage) || selected.archived}>{selected.salesOwnerId && !ownerOptions.some((owner) => owner.id === selected.salesOwnerId) && <MenuItem value={selected.salesOwnerId} disabled>{ownerLabel(selected.salesOwnerId)}</MenuItem>}{ownerOptions.map((owner) => <MenuItem value={owner.id} key={owner.id}>{owner.label}</MenuItem>)}</TextField>
        <TextField label="Private sales notes" multiline minRows={2} value={edits.notes} onChange={(e) => setEdits((current) => ({ ...current, notes: e.target.value }))} disabled={terminalStages.has(selected.stage) || selected.archived} />

        {permittedSalesStageMoves(selected.stage, hasCurrentProposal(selected)).length > 0 && !selected.archived && <>
          <Divider /><Typography variant="h3">Next stage action</Typography>
          <TextField select label="Move to stage" value={targetStage} onChange={(e) => { setTargetStage(e.target.value as HmgSalesStage); setTransitionError(""); }}>
            <MenuItem value="">Choose a permitted stage</MenuItem>{permittedSalesStageMoves(selected.stage, hasCurrentProposal(selected)).map((move) => <MenuItem value={move} key={move}>{move}</MenuItem>)}
          </TextField>
          {targetStage === "Proposal" && <Alert severity="info">The existing proposal snapshot must be current. The server validates readiness; this action does not create an order.</Alert>}
          {transitionError && <Alert severity="error">{transitionError}</Alert>}
          <Button variant="contained" disabled={!targetStage || transitioning} onClick={() => setTransitionConfirmOpen(true)}>{targetStage ? `Move to ${targetStage}` : "Move to selected stage"}</Button>
        </>}
        {selected.stage !== "Lead" && <Button component={RouterLink} to={`/sales/projects/${encodeURIComponent(selected.id)}`} onClick={() => setSelected(null)}>Open opportunity workspace</Button>}
      </Stack></DialogContent><DialogActions sx={{ flexWrap: "wrap" }}><Button variant="outlined" onClick={() => setSelected(null)}>Close</Button><Button variant="contained" disabled={savingNotes || terminalStages.has(selected.stage) || selected.archived || (edits.source === (selected.sales?.source || "") && edits.contactName === (selected.sales?.contactName || "") && edits.contactChannel === (selected.sales?.contactChannel || "") && edits.contactDetail === (selected.sales?.contactDetail || "") && edits.notes === (selected.sales?.notes || "") && !ownerChanged)} onClick={() => void saveNotes()}>{savingNotes ? "Saving…" : "Save lead details"}</Button></DialogActions></>}
    </Dialog>
    <Dialog open={transitionConfirmOpen && !!selected && !!targetStage} onClose={() => !transitioning && setTransitionConfirmOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Move this opportunity to {targetStage}?</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>This will save a new pipeline stage for “{selected?.name}”. Proposal readiness and terminal-stage rules are validated by Taruvi.</Typography>
        {targetStage === "Declined" && <TextField autoFocus required fullWidth label="Decline reason" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} multiline minRows={2} sx={{ mt: 1 }} />}
        {transitionError && <Alert severity="error" sx={{ mt: 2 }}>{transitionError}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" disabled={transitioning} onClick={() => setTransitionConfirmOpen(false)}>Cancel</Button>
        <Button variant="contained" disabled={transitioning || !targetStage || (targetStage === "Declined" && !declineReason.trim())} onClick={() => void transition()}>{transitioning ? "Saving…" : `Confirm ${targetStage || "stage"}`}</Button>
      </DialogActions>
    </Dialog>
  </PageContainer>;
}
