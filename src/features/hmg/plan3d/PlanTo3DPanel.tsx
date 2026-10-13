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
  TextField,
  Typography,
} from "@mui/material";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import type { HmgProject, HmgReviewedPlanRoom } from "../types";
import { Panel, EmptyState } from "../components/common";
import { extractPlanDimensions, isSupportedPlanFile, uploadPlanFile } from "./client";
import { createFullHomeLayout } from "./fullHomeLayout";
import { FullHomePlanViewer } from "./FullHomePlanViewer";
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

export function PlanTo3DPanel({ project, command, refresh }: { project: HmgProject; command: CommandRunner; refresh: () => unknown }) {
  const uploads = project.planUploads || [];
  const latest = uploads[uploads.length - 1];
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState<ReviewRoomDraft[]>([]);
  const [height, setHeight] = useState(10);
  const [aiConsent, setAiConsent] = useState(false);
  const busy = working || command.busy;

  useEffect(() => {
    setRooms(reviewRoomsForUpload(latest));
    setHeight(latest?.reviewed?.defaultHeightFt || 10);
    setAiConsent(false);
  }, [latest?.id, latest?.status, project.version]);

  const readyToReview = !!latest?.extraction?.rooms?.length || rooms.length > 0;
  const reviewMessage = reviewRoomsValidationMessage(rooms);
  const latestReviewedIsValid = !!latest?.reviewed?.rooms?.length && areReviewRoomsValid(latest.reviewed.rooms);
  const readyToGenerate = latestReviewedIsValid && !latest?.generatedDesignIds?.length;
  const generatedRoomLinks = (latest?.generatedDesignIds || []).map((designId, index) => ({
    designId,
    name: latest?.reviewed?.rooms?.[index]?.name || rooms[index]?.name || `Room ${index + 1}`,
  }));
  const fullHomeLayout = useMemo(() => {
    if (!areReviewRoomsValid(rooms)) return null;
    return createFullHomeLayout(reviewRowsToPayload(rooms));
  }, [rooms]);
  const uploadDisabled = !file || !isSupportedPlanFile(file) || busy || project.archived;
  const extractionDisabled = busy || project.archived || !aiConsent;
  const roomCount = rooms.length;
  const extractedSummary = useMemo(() => latest?.extraction?.rooms?.map((r) => `${r.label}: ${r.lengthFt ?? "?"} x ${r.widthFt ?? "?"} ft`).join("; "), [latest]);

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
      try { await command.run("markPlanExtractionFailed", { uploadId: latest.id, message }, startedVersion); await refresh(); }
      catch { /* Preserve the original extraction error in the panel. */ }
    } finally { setWorking(false); }
  };

  const updateRoom = (index: number, patch: Partial<ReviewRoomDraft>) => {
    setRooms((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
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
    });
  };

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
              {latest.error && <Alert severity="error">{typeof latest.error === "string" ? latest.error : latest.error.message}</Alert>}
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
            <Typography variant="h3">Review rooms ({roomCount})</Typography>
            {reviewMessage && <Alert severity="warning">{reviewMessage}</Alert>}
            <TextField label="Default wall height (ft)" type="number" value={height} inputProps={{ min: 6, max: 20, step: 0.5 }} onChange={(e) => updateDefaultHeight(e.target.value)} />
            {rooms.map((room, index) => (
              <Box key={room.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr repeat(3, .8fr) 1fr" }, gap: 1.5, alignItems: "center" }}>
                <TextField label="Room" value={room.name} onChange={(e) => updateRoom(index, { name: e.target.value })} />
                <TextField label="Length ft" type="number" value={numberInputValue(room.lengthFt)} inputProps={{ min: 3.3, max: 100, step: 0.1 }} onChange={(e) => updateRoom(index, { lengthFt: parseNumberInput(e.target.value) })} />
                <TextField label="Width ft" type="number" value={numberInputValue(room.widthFt)} inputProps={{ min: 3.3, max: 100, step: 0.1 }} onChange={(e) => updateRoom(index, { widthFt: parseNumberInput(e.target.value) })} />
                <TextField label="Height ft" type="number" value={numberInputValue(room.heightFt)} inputProps={{ min: 6, max: 20, step: 0.5 }} onChange={(e) => updateRoom(index, { heightFt: parseNumberInput(e.target.value) })} />
                <TextField select label="Category" value={room.category} onChange={(e) => updateRoom(index, { category: e.target.value as ReviewRoomDraft["category"] })}>
                  {categories.map((category) => <MenuItem key={category} value={category}>{category.replaceAll("_", " ")}</MenuItem>)}
                </TextField>
                <FormControlLabel control={<Checkbox checked={room.includeFloor} onChange={(e) => updateRoom(index, { includeFloor: e.target.checked })} />} label="Floor" />
                <FormControlLabel control={<Checkbox checked={room.includeInteriorWalls} onChange={(e) => updateRoom(index, { includeInteriorWalls: e.target.checked })} />} label="Interior walls" />
              </Box>
            ))}
            {fullHomeLayout && <FullHomePlanViewer layout={fullHomeLayout} />}
            {generatedRoomLinks.length > 0 && (
              <Alert severity="info">
                Generated Studio links open one reviewed room at a time for stone assignment and quote creation. Use the whole-home preview above to check the combined plan layout.
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
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button variant="contained" disabled={busy || !rooms.length || !!reviewMessage || project.archived} onClick={() => run(saveReviewed)}>Save reviewed plan</Button>
              <Button variant="outlined" disabled={busy || !readyToGenerate || project.archived} onClick={() => latest && run(() => command.run("generateStudioDesignsFromPlan", { uploadId: latest.id }))}>Generate 3D rooms</Button>
            </Stack>
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Panel>
  );
}


