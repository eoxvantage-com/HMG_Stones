import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import type { HmgProject, HmgReviewedPlanRoom, HmgVisualPreview } from "../types";
import type { GalleryReference } from "../design/galleryReferences";
import type { StudioAssignment } from "../studio3d/types";
import { Panel, EmptyState } from "../components/common";
import { extractPlanDimensions, generatePlanVisualPreview, isSupportedPlanFile, requestPlanVisualPreviewUrl, uploadPlanFile } from "./client";
import { createFullHomeLayout } from "./fullHomeLayout";
import { FullHomePlanViewer } from "./FullHomePlanViewer";
import { GalleryBrowser } from "../components/GalleryBrowser";
import { parseAssignmentSettings } from "../studio3d/materialAssignments";
import { taruviTokens } from "../../../../themeOptions";
import {
  areReviewRoomsValid,
  numberInputValue,
  parseNumberInput,
  reviewRoomsForUpload,
  reviewRoomsValidationMessage,
  reviewRowsToPayload,
  type ReviewRoomDraft,
} from "./reviewRooms";

type CommandRunner = {
  busy: boolean;
  run: (command: string, payload?: Record<string, unknown>, baseVersion?: number) => Promise<HmgProject>;
};

const categories = ["hall", "kitchen", "bedroom", "toilet", "sit_out", "pooja", "stair", "other"] as const;

const previewPlaceholder =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#f3f0e8"/><text x="320" y="170" text-anchor="middle" font-family="Arial" font-size="20" fill="#4b5a3f">AI visual preview</text><text x="320" y="200" text-anchor="middle" font-family="Arial" font-size="14" fill="#6b7280">Loading private image</text></svg>`);

function VisualPreviewImage({ preview }: { preview: HmgVisualPreview }) {
  const [url, setUrl] = useState(previewPlaceholder);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    requestPlanVisualPreviewUrl(preview, controller.signal)
      .then((nextUrl) => { objectUrl = nextUrl; setUrl(nextUrl); })
      .catch(() => setUrl(previewPlaceholder));
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview.storagePath]);
  return (
    <Box
      component="img"
      alt={`AI visual preview ${preview.id}`}
      src={url}
      sx={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 1, border: 1, borderColor: "divider", bgcolor: "background.default" }}
    />
  );
}

export function PlanTo3DPanel({ project, command, refresh }: { project: HmgProject; command: CommandRunner; refresh: () => unknown }) {
  const uploads = project.planUploads || [];
  const latest = uploads[uploads.length - 1];
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState<ReviewRoomDraft[]>([]);
  const [height, setHeight] = useState(10);
  const [aiConsent, setAiConsent] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, StudioAssignment>>({});
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const busy = working || command.busy;

  useEffect(() => {
    setRooms(reviewRoomsForUpload(latest));
    setHeight(latest?.reviewed?.defaultHeightFt || 10);
    setAiConsent(false);
    setAssignments(latest?.reviewed?.assignments || {});
    setSelectedTarget("");
  }, [latest?.id, latest?.status, project.version]);

  const readyToReview = !!latest?.extraction?.rooms?.length || rooms.length > 0;
  const reviewMessage = reviewRoomsValidationMessage(rooms);
  const latestReviewedIsValid = !!latest?.reviewed?.rooms?.length && areReviewRoomsValid(latest.reviewed.rooms);
  const readyToGenerate = latestReviewedIsValid;
  const readyToQuotePlan = !!latest?.generatedDesignIds?.length;
  const generatedRoomLinks = (latest?.generatedDesignIds || []).map((designId, index) => ({
    designId,
    name: latest?.reviewed?.rooms?.[index]?.name || rooms[index]?.name || `Room ${index + 1}`,
  }));
  const fullHomeLayout = useMemo(() => {
    if (!areReviewRoomsValid(rooms)) return null;
    return createFullHomeLayout(reviewRowsToPayload(rooms), {
      builtUpAreaSqFt: latest?.extraction?.builtUpAreaSqFt,
      buildingFacing: latest?.extraction?.buildingFacing,
      floorName: latest?.extraction?.floorName,
      footprint: latest?.extraction?.footprint,
      features: latest?.extraction?.features || [],
      roomRects: Object.fromEntries((latest?.extraction?.rooms || [])
        .filter((room) => typeof room.xFt === "number" && typeof room.zFt === "number" && typeof room.lengthFt === "number" && typeof room.widthFt === "number")
        .map((room) => [room.id, { xFt: room.xFt as number, zFt: room.zFt as number, lengthFt: room.lengthFt as number, widthFt: room.widthFt as number }])),
    });
  }, [rooms, latest?.extraction]);
  const uploadDisabled = !file || !isSupportedPlanFile(file) || busy || project.archived;
  const extractionDisabled = busy || project.archived || !aiConsent;
  const roomCount = rooms.length;
  const extractedSummary = useMemo(() => latest?.extraction?.rooms?.map((r) => `${r.label}: ${r.lengthFt ?? "?"} x ${r.widthFt ?? "?"} ft`).join("; "), [latest]);
  const selectedAssignment = selectedTarget ? assignments[selectedTarget] : undefined;

  const run = async (action: () => Promise<unknown>) => {
    setWorking(true); setError("");
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Plan-to-3D action failed. Your upload is retained."); }
    finally { setWorking(false); }
  };

  const runExtraction = async () => {
    if (!latest) return;
    setWorking(true); setError("");
    let startedVersion = project.version;
    try {
      const started = await command.run("startPlanExtraction", { uploadId: latest.id });
      startedVersion = started.version;
      const draft = await extractPlanDimensions(project.id, latest.id);
      await command.run("savePlanExtractionDraft", { uploadId: latest.id, draft }, startedVersion);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Plan extraction failed. Your upload is retained.";
      setError(message);
      const detail = typeof (e as { detail?: unknown })?.detail === "string" ? (e as { detail: string }).detail : "";
      const stage = typeof (e as { stage?: unknown })?.stage === "string" ? (e as { stage: string }).stage : "";
      try { await command.run("markPlanExtractionFailed", { uploadId: latest.id, message, stage, detail }, startedVersion); await refresh(); }
      catch { /* Preserve the original extraction error in the panel. */ }
    } finally { setWorking(false); }
  };

  const runVisualPreview = async () => {
    if (!latest) return;
    setWorking(true); setError("");
    let startedVersion = project.version;
    try {
      const started = await command.run("startPlanVisualPreview", { uploadId: latest.id });
      startedVersion = started.version || startedVersion;
      const preview = await generatePlanVisualPreview(project.id, latest.id);
      await command.run("savePlanVisualPreview", { uploadId: latest.id, preview }, startedVersion);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Diffusers visual preview failed.";
      setError(message);
      const detail = typeof (e as { detail?: unknown })?.detail === "string" ? (e as { detail: string }).detail : "";
      const stage = typeof (e as { stage?: unknown })?.stage === "string" ? (e as { stage: string }).stage : "";
      try { await command.run("markPlanVisualPreviewFailed", { uploadId: latest.id, message, stage, detail }, startedVersion); await refresh(); }
      catch { /* Preserve the original Diffusers error in the panel. */ }
    } finally { setWorking(false); }
  };

  const targetLabel = (target: string) => {
    const [roomId, surface] = target.split(":");
    const room = rooms.find((item) => item.id === roomId);
    return room ? `${room.name} ${surface === "walls" ? "interior walls" : "floor"}` : "selected surface";
  };

  const validAssignmentTargets = (items = rooms) => new Set(items.flatMap((room) => [
    ...(room.includeFloor ? [`${room.id}:floor`] : []),
    ...(room.includeInteriorWalls ? [`${room.id}:walls`] : []),
  ]));

  const filteredAssignments = () => {
    const valid = validAssignmentTargets();
    return Object.fromEntries(Object.entries(assignments).filter(([key]) => valid.has(key)));
  };
  const assignedCount = Object.keys(filteredAssignments()).length;

  const selectPlanMaterial = (ref: GalleryReference) => {
    if (!selectedTarget) { setError("Select a reviewed room floor or wall target first."); return; }
    if (!ref.surfaceEligible) { setError("Select an HMG stone that is eligible for surface preview."); return; }
    try {
      const assignment = parseAssignmentSettings(ref.id, { mode: "surface", rotation: 0, width: "", height: "", grout: "0", color: taruviTokens.hmg.border });
      setAssignments((items) => ({ ...items, [selectedTarget]: assignment }));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Material assignment failed."); }
  };

  const updateRoom = (index: number, patch: Partial<ReviewRoomDraft>) => {
    setRooms((items) => {
      const next = items.map((item, i) => i === index ? { ...item, ...patch } : item);
      const valid = validAssignmentTargets(next);
      setAssignments((current) => Object.fromEntries(Object.entries(current).filter(([key]) => valid.has(key))));
      if (selectedTarget && !valid.has(selectedTarget)) setSelectedTarget("");
      return next;
    });
  };

  const updateDefaultHeight = (value: string) => {
    const next = Number(value);
    setHeight(next);
    if (Number.isFinite(next)) setRooms((items) => items.map((item) => ({ ...item, heightFt: next })));
  };

  const saveReviewed = () => {
    if (!latest) return Promise.resolve();
    return command.run("saveReviewedPlan", {
      uploadId: latest.id,
      defaultHeightFt: height,
      rooms: reviewRowsToPayload(rooms) as HmgReviewedPlanRoom[],
      assignments: filteredAssignments(),
    });
  };

  const reviewActions = (
    <Stack direction="row" gap={1} flexWrap="wrap" justifyContent={{ xs: "stretch", md: "flex-end" }}>
      <Button variant="contained" disabled={busy || !rooms.length || !!reviewMessage || project.archived} onClick={() => run(saveReviewed)}>Save reviewed plan</Button>
      <Button variant="outlined" disabled={busy || !readyToGenerate || project.archived} onClick={() => latest && run(() => command.run("generateStudioDesignsFromPlan", { uploadId: latest.id }))}>Generate / sync 3D rooms</Button>
      <Button variant="outlined" disabled={busy || !readyToGenerate || project.archived} startIcon={busy ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon />} onClick={runVisualPreview}>Generate AI visual preview</Button>
      <Button variant="outlined" disabled={busy || !readyToQuotePlan || project.archived} onClick={() => latest && run(() => command.run("createPlanQuoteDraft", { uploadId: latest.id, replaceExisting: true }))}>Create whole-plan quote draft</Button>
    </Stack>
  );

  return (
    <Panel
      title="Floor plan to 3D"
      action={latest ? <Chip label={latest.status} color={latest.status === "Failed" ? "error" : latest.status === "Ready for 3D" ? "success" : "warning"} variant="outlined" /> : undefined}
    >
      <Stack spacing={2}>
        <Typography color="text.secondary">
          Upload a PDF or image floor plan, extract readable dimensions with Gemini, review the rooms, then generate saved 3D studio rooms for stone selection and quote creation.
        </Typography>
        <Alert severity="info">AI extraction is a draft only. Confirm dimensions before generating 3D and quoting.</Alert>
        <FormControlLabel control={<Checkbox checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />} label="I confirm this customer plan may be sent to Gemini for AI dimension extraction." />
        <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
          <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={busy || project.archived}>
            Choose plan
            <input hidden type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Button>
          <Typography variant="body2" color={file && !isSupportedPlanFile(file) ? "error" : "text.secondary"}>
            {file ? file.name : "PDF, PNG, JPG, or WebP under 20 MB"}
          </Typography>
          <Button
            variant="contained"
            disabled={uploadDisabled}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
            onClick={() => file && run(async () => { await uploadPlanFile(project, file); setFile(null); })}
          >
            Upload plan
          </Button>
        </Stack>
        {latest ? (
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
            <Stack spacing={1.5}>
              <Typography variant="h3">{latest.fileName}</Typography>
              <Typography variant="body2" color="text.secondary">{latest.mimeType} - {(latest.sizeBytes / 1024 / 1024).toFixed(2)} MB</Typography>
              {latest.error && (
                <Alert severity="error">
                  <Stack spacing={0.5}>
                    <Typography>{typeof latest.error === "string" ? latest.error : latest.error.message}</Typography>
                    {typeof latest.error !== "string" && latest.error.stage && <Typography variant="body2">Failed at: {latest.error.stage}</Typography>}
                    {typeof latest.error !== "string" && latest.error.detail && <Typography variant="body2">Detail: {latest.error.detail}</Typography>}
                  </Stack>
                </Alert>
              )}
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Button
                  variant="outlined"
                  startIcon={busy ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon />}
                  disabled={extractionDisabled}
                  onClick={runExtraction}
                >
                  {latest.extraction ? "Re-extract dimensions" : "Extract dimensions"}
                </Button>
              </Stack>
              {extractedSummary && <Typography variant="body2">Extracted draft: {extractedSummary}</Typography>}
            </Stack>
          </Box>
        ) : (
          <EmptyState title="No plan uploaded yet" description="Upload the customer floor plan to begin the 3D generation workflow." />
        )}
        {readyToReview && (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} gap={2} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }}>
              <Box>
                <Typography variant="h3">Review rooms ({roomCount})</Typography>
                <Typography variant="body2" color="text.secondary">
                  Review dimensions, select stone targets, and save without scrolling through the material catalogue.
                </Typography>
              </Box>
              {reviewActions}
            </Stack>
            {reviewMessage && <Alert severity="warning">{reviewMessage}</Alert>}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.45fr) minmax(360px, 0.9fr)" }, gap: 2, alignItems: "start" }}>
              <Stack spacing={2} sx={{ minWidth: 0 }}>
                <TextField label="Default wall height (ft)" type="number" value={height} inputProps={{ min: 6, max: 20, step: 0.5 }} onChange={(e) => updateDefaultHeight(e.target.value)} />
                <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1, maxHeight: { xs: 420, lg: 560 } }}>
                  <Table size="small" stickyHeader aria-label="Review rooms">
                    <TableHead>
                      <TableRow>
                        <TableCell>Room</TableCell>
                        <TableCell align="right">Length ft</TableCell>
                        <TableCell align="right">Width ft</TableCell>
                        <TableCell align="right">Height ft</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell>Surfaces</TableCell>
                        <TableCell>Stone targets</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rooms.map((room, index) => (
                        <TableRow key={room.id} hover selected={selectedTarget.startsWith(`${room.id}:`)}>
                          <TableCell sx={{ minWidth: 170 }}>
                            <TextField label="Room" value={room.name} size="small" fullWidth onChange={(e) => updateRoom(index, { name: e.target.value })} />
                          </TableCell>
                          <TableCell align="right" sx={{ minWidth: 120 }}>
                            <TextField label="Length ft" type="number" value={numberInputValue(room.lengthFt)} size="small" inputProps={{ min: 3.3, max: 100, step: 0.1 }} onChange={(e) => updateRoom(index, { lengthFt: parseNumberInput(e.target.value) })} />
                          </TableCell>
                          <TableCell align="right" sx={{ minWidth: 120 }}>
                            <TextField label="Width ft" type="number" value={numberInputValue(room.widthFt)} size="small" inputProps={{ min: 3.3, max: 100, step: 0.1 }} onChange={(e) => updateRoom(index, { widthFt: parseNumberInput(e.target.value) })} />
                          </TableCell>
                          <TableCell align="right" sx={{ minWidth: 120 }}>
                            <TextField label="Height ft" type="number" value={numberInputValue(room.heightFt)} size="small" inputProps={{ min: 6, max: 20, step: 0.5 }} onChange={(e) => updateRoom(index, { heightFt: parseNumberInput(e.target.value) })} />
                          </TableCell>
                          <TableCell sx={{ minWidth: 150 }}>
                            <TextField select label="Category" value={room.category} size="small" fullWidth onChange={(e) => updateRoom(index, { category: e.target.value as ReviewRoomDraft["category"] })}>
                              {categories.map((category) => <MenuItem key={category} value={category}>{category.replaceAll("_", " ")}</MenuItem>)}
                            </TextField>
                          </TableCell>
                          <TableCell sx={{ minWidth: 150 }}>
                            <Stack spacing={0.5}>
                              <FormControlLabel control={<Checkbox checked={room.includeFloor} size="small" onChange={(e) => updateRoom(index, { includeFloor: e.target.checked })} />} label="Floor" />
                              <FormControlLabel control={<Checkbox checked={room.includeInteriorWalls} size="small" onChange={(e) => updateRoom(index, { includeInteriorWalls: e.target.checked })} />} label="Interior walls" />
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Stack direction="row" gap={1} flexWrap="wrap">
                              <Button size="small" variant={selectedTarget === `${room.id}:floor` ? "contained" : "outlined"} disabled={!room.includeFloor} onClick={() => setSelectedTarget(`${room.id}:floor`)}>
                                Select {room.name} floor{assignments[`${room.id}:floor`] ? " (assigned)" : ""}
                              </Button>
                              <Button size="small" variant={selectedTarget === `${room.id}:walls` ? "contained" : "outlined"} disabled={!room.includeInteriorWalls} onClick={() => setSelectedTarget(`${room.id}:walls`)}>
                                Select {room.name} walls{assignments[`${room.id}:walls`] ? " (assigned)" : ""}
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {fullHomeLayout && <FullHomePlanViewer layout={fullHomeLayout} assignments={assignments} openings={latest?.extraction?.openings || []} />}
              </Stack>
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2, position: { lg: "sticky" }, top: { lg: 16 }, maxHeight: { lg: "calc(100vh - 120px)" }, overflow: "auto" }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                    <Typography variant="h3">Whole-plan stone assignment</Typography>
                    <Chip label={`${assignedCount} assigned`} size="small" variant="outlined" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Select a floor or wall target in the table, then choose an HMG surface-eligible stone here.
                  </Typography>
                  <Alert severity={selectedTarget ? "info" : "warning"}>
                    {selectedTarget ? `Selected target: ${targetLabel(selectedTarget)}${selectedAssignment ? ` - assigned ${selectedAssignment.assetId}` : " - no stone assigned yet"}` : "Choose a room floor or wall target before selecting a material."}
                  </Alert>
                  <GalleryBrowser mode="materials" compact selectedId={selectedAssignment?.assetId} onSelect={selectPlanMaterial} />
                </Stack>
              </Box>
            </Box>
            {generatedRoomLinks.length > 0 && (
              <Alert severity="info">
                Generated Studio links open one reviewed room at a time for detailed 3D review. Whole-plan stone assignments saved here are synced into every generated room.
              </Alert>
            )}
            {generatedRoomLinks.length > 0 && (
              <Stack direction="row" gap={1} flexWrap="wrap">
                {generatedRoomLinks.map((link) => (
                  <Button key={link.designId} component={RouterLink} to={`/studio-3d?projectId=${encodeURIComponent(project.id)}&designId=${encodeURIComponent(link.designId)}`} variant="outlined" startIcon={<ViewInArRoundedIcon />}>
                    Open {link.name} 3D room
                  </Button>
                ))}
              </Stack>
            )}
            {latest && (
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: "column", sm: "row" }} gap={1} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }}>
                    <Box>
                      <Typography variant="h3">AI visual previews</Typography>
                      <Typography variant="body2" color="text.secondary">AI visual only - not measured. Reviewed geometry and quotes remain the source of truth.</Typography>
                    </Box>
                    {latest.visualPreviewStatus && <Chip size="small" variant="outlined" color={latest.visualPreviewStatus === "Failed" ? "error" : latest.visualPreviewStatus === "Ready" ? "success" : "warning"} label={latest.visualPreviewStatus} />}
                  </Stack>
                  {latest.visualPreviewStatus === "Generating" && <Alert severity="info">Diffusers visual preview is generating. Keep this as a visual aid only.</Alert>}
                  {latest.visualPreviewError && <Alert severity="error">{latest.visualPreviewError.message}</Alert>}
                  {latest.visualPreviews?.length ? (
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
                      {latest.visualPreviews.map((preview) => (
                        <Box key={preview.id} sx={{ minWidth: 0 }}>
                          <VisualPreviewImage preview={preview} />
                          <Typography variant="body2" sx={{ mt: 1 }}>{preview.model}</Typography>
                          <Typography variant="caption" color="text.secondary">{preview.source}</Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Alert severity="info">No visual preview saved yet. Generate one after reviewing the rooms.</Alert>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Panel>
  );
}


