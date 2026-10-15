import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { useWarnAboutChange } from "@refinedev/core";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Drawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import { taruviTokens } from "../../../../themeOptions";
import { useMaterial } from "../galleryApi";
import {
  applyAssignment,
  parseAssignmentSettings,
  AssignmentInputs,
} from "./materialAssignments";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import { useWorkspace } from "../components/AppShell";
import { GalleryBrowser } from "../components/GalleryBrowser";
import type { GalleryReference } from "../design/galleryReferences";
import {
  createDesign,
  parseStudioDesign,
  roomObjectCatalog,
  addRoomObject,
  moveRoomObject,
  rotateRoomObject,
  removeRoomObject,
  resizeRoom,
  surfaces,
} from "./geometry";
import { BlueprintViewport } from "./BlueprintViewport";
import type { StudioDesign } from "./types";
import {
  commitHistory,
  undoHistory,
  redoHistory,
  reconcileGeometryRevision,
  History,
} from "./history";
import { PageContainer } from "../../../components";
import { createFullHomeLayout } from "../plan3d/fullHomeLayout";
import { FullHomePlanViewer } from "../plan3d/FullHomePlanViewer";
import { homeAssignments } from "../plan3d/homeAssignments";
import { useProjectCommand, useWorkflow } from "../api";
import type { HmgList, HmgProject } from "../types";
import {
  CommandDialog,
  CommandDialogSpec,
  ConflictRecovery,
  EmptyState,
  LoadError,
  LoadingState,
  Panel,
} from "../components/common";

const MATERIAL_WIDTH_KEY = "hmg.studio.material-panel-width";
const MATERIAL_WIDTH_MIN = 280;
const MATERIAL_WIDTH_MAX = 560;
const MATERIAL_WIDTH_DEFAULT = 360;

function clampMaterialWidth(width: number) {
  return Math.min(MATERIAL_WIDTH_MAX, Math.max(MATERIAL_WIDTH_MIN, width));
}

function readMaterialWidth() {
  try {
    const stored = Number(window.localStorage.getItem(MATERIAL_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0
      ? clampMaterialWidth(stored)
      : MATERIAL_WIDTH_DEFAULT;
  } catch {
    return MATERIAL_WIDTH_DEFAULT;
  }
}

/** Project-scoped route; URL state supports direct links without replacing host navigation. */
export function StoneStudio() {
  const workspace = useWorkspace();
  const [params, setParams] = useSearchParams();
  const projectId = params.get("projectId") || undefined;
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const projects = useWorkflow<HmgList<HmgProject>>("listProjects", undefined, {
    search,
    page,
    pageSize: 50,
  });
  const project = useWorkflow<HmgProject>(
    workspace?.canPrice ? "getSalesProject" : "getProject",
    projectId,
    undefined,
    !!projectId
  );
  return (
    <PageContainer sx={{ maxWidth: "none", px: { xs: 1, md: 2 }, py: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          gap={2}
          alignItems={{ md: "center" }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h2">3D Stone Studio</Typography>
            <Typography variant="body2" color="text.secondary">
              Room geometry and gallery-led material exploration · No orders or
              messages sent
            </Typography>
          </Box>
          <TextField
            label="Find a project"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            size="small"
          />
          <TextField
            label="Project"
            select
            value={projectId || ""}
            onChange={(e) => setParams({ projectId: e.target.value })}
            sx={{ minWidth: 220 }}
            size="small"
          >
            {projectId &&
              !projects.data?.data.some((p) => p.id === projectId) && (
                <MenuItem value={projectId}>
                  {project.data?.name || "Selected project"}
                </MenuItem>
              )}
            {(projects.data?.data || []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        {(projects.data?.total || 0) > 50 && (
          <Stack direction="row" justifyContent="flex-end" gap={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">Showing {(projects.data?.data || []).length} of {projects.data?.total || 0} projects</Typography>
            <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <Button disabled={page * 50 >= (projects.data?.total || 0)} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </Stack>
        )}
        {projects.error && <LoadError retry={() => projects.refetch()} />}
        {!projectId ? (
          projects.loading ? (
            <LoadingState />
          ) : (
            <EmptyState
              title="Choose a project to start"
              description="Your room design and quote review stay with the same authorized project."
            />
          )
        ) : project.loading ? (
          <LoadingState />
        ) : project.error || !project.data ? (
          <LoadError retry={() => project.refetch()} />
        ) : (
          <StudioEditor
            key={projectId}
            project={project.data}
            refresh={project.refreshValue}
            designId={params.get("designId") || undefined}
            onDesignId={(id) =>
              setParams({ projectId, designId: id }, { replace: true })
            }
          />
        )}
      </Stack>
    </PageContainer>
  );
}

function StudioEditor({
  project,
  refresh,
  designId,
  onDesignId,
}: {
  project: HmgProject;
  refresh: () => Promise<HmgProject>;
  designId?: string;
  onDesignId: (id: string) => void;
}) {
  const context = useWorkspace();
  const navigate = useNavigate();
  const readOnly =
    project.archived ||
    !context ||
    (context.isStaff && !context.canPrice) ||
    (context.isExecutive && !context.canPrice);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false),
    [fullscreenError, setFullscreenError] = useState(""),
    [roomOpen, setRoomOpen] = useState(true),
    [materialPanelOpen, setMaterialPanelOpen] = useState(true);
  const [materialPanelWidth, setMaterialPanelWidth] = useState(readMaterialWidth);
  const materialResize = useRef<{ x: number; width: number; pointerId: number }>();
  useEffect(() => {
    try {
      window.localStorage.setItem(MATERIAL_WIDTH_KEY, String(materialPanelWidth));
    } catch {
      // Resizing remains available for this session when storage is unavailable.
    }
  }, [materialPanelWidth]);
  const resizeMaterialPanel = (width: number) =>
    setMaterialPanelWidth(clampMaterialWidth(width));
  const startMaterialResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    materialResize.current = {
      x: event.clientX,
      width: materialPanelWidth,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveMaterialResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = materialResize.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    resizeMaterialPanel(drag.width + drag.x - event.clientX);
  };
  const endMaterialResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (materialResize.current?.pointerId !== event.pointerId) return;
    materialResize.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  useEffect(() => {
    const sync = () =>
      setFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullscreen = async () => {
    try {
      setFullscreenError("");
      if (document.fullscreenElement === workspaceRef.current)
        await document.exitFullscreen();
      else if (workspaceRef.current?.requestFullscreen)
        await workspaceRef.current.requestFullscreen();
      else
        setFullscreenError(
          "Fullscreen is unavailable in this browser. The full-width workspace remains usable."
        );
    } catch {
      setFullscreenError(
        "Fullscreen could not be opened. Your work is retained."
      );
    }
  };
  const initial = () => createDesign(project.id);
  const [history, setHistory] = useState<History<StudioDesign>>(() => ({
    past: [],
    present: initial(),
    future: [],
  }));
  const design = history.present;
  const [baseVersion, setBaseVersion] = useState(project.version),
    [saved, setSaved] = useState(""),
    [savedRevision, setSavedRevision] = useState<number>();
  const [designRevisionChanged, setDesignRevisionChanged] = useState(false);
  const [view, setView] = useState<"2d" | "3d" | "home">("2d"),
    [selected, setSelected] = useState<string>(),
    [status, setStatus] = useState("Loading planner"),
    [resetKey, setResetKey] = useState(0);
  const [dialog, setDialog] = useState<CommandDialogSpec | null>(null),
    [error, setError] = useState(""),
    [materialsOpen, setMaterialsOpen] = useState(false),
    [chosenReference, setChosenReference] = useState<GalleryReference>(),
    [quoteOpen, setQuoteOpen] = useState(false);
  const [dimensions, setDimensions] = useState({
    name: design.room.name,
    length: String(design.room.length),
    width: String(design.room.width),
    height: String(design.room.height),
  });
  const command = useProjectCommand(project, refresh);
  const saveLock = useRef(false);
  const prepareLock = useRef(false);
  const [preparePending, setPreparePending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const busy = command.busy || savePending || preparePending;
  const wholeHomeUpload = useMemo(() => {
    const uploads = [...(project.planUploads || [])].reverse().filter(upload=>upload.reviewed?.rooms?.length);
    return uploads.find(upload=>upload.generatedDesignIds.includes(design.id)) || uploads[0];
  }, [project.planUploads, design.id]);
  const wholeHomeAssignments = useMemo(() => homeAssignments(wholeHomeUpload, project.stoneStudioDesigns || [], design), [wholeHomeUpload, project.stoneStudioDesigns, design]);
  const activePlanRoomId = wholeHomeUpload?.reviewed?.rooms[wholeHomeUpload.generatedDesignIds.indexOf(design.id)]?.id;
  const wholeHomeLayout = useMemo(() => {
    const reviewed = wholeHomeUpload?.reviewed;
    if (!reviewed?.rooms?.length) return null;
    // Studio edits any structural surface; reviewed inclusion flags govern plan selection, not room visibility.
    return createFullHomeLayout(reviewed.rooms.map(room=>({...room,includeFloor:true,includeInteriorWalls:true})), {
      builtUpAreaSqFt: wholeHomeUpload?.extraction?.builtUpAreaSqFt,
      buildingFacing: wholeHomeUpload?.extraction?.buildingFacing,
      floorName: wholeHomeUpload?.extraction?.floorName,
      footprint: wholeHomeUpload?.extraction?.footprint,
      features: wholeHomeUpload?.extraction?.features || [],
      roomRects: Object.fromEntries((reviewed.rooms || [])
        .filter((room) => typeof room.xFt === "number" && typeof room.zFt === "number")
        .map((room) => [room.id, { xFt: room.xFt as number, zFt: room.zFt as number, lengthFt: room.lengthFt, widthFt: room.widthFt }])),
    });
  }, [wholeHomeUpload]);
  const designSummaries = (project.studioQuoteSummaries || []).filter(q => q.designId === design.id);
  const latestSummaries = [...new Map(designSummaries.map(q => [q.option, q])).values()];
  const historicalSummaries = designSummaries.filter(q => !latestSummaries.includes(q));
  const factor = design.room.unit === "ft" ? 3.280839895 : 1;
  const dimensionsDirty =
    dimensions.name !== design.room.name ||
    (["length", "width", "height"] as const).some(
      (key) =>
        dimensions[key] !==
        String(Number((design.room[key] * factor).toFixed(3)))
    );
  const dirty = JSON.stringify(design) !== saved || dimensionsDirty;
  const { setWarnWhen } = useWarnAboutChange();
  useEffect(() => {
    setWarnWhen(dirty);
    return () => setWarnWhen(false);
  }, [dirty, setWarnWhen]);
  const loaded = useRef<string>();
  const change = (next: StudioDesign) =>
    setHistory((h) => commitHistory(h, next));
  const syncDimensions = (next: StudioDesign) => {
    const factor = next.room.unit === "ft" ? 3.280839895 : 1;
    setDimensions({
      name: next.room.name,
      length: String(Number((next.room.length * factor).toFixed(3))),
      width: String(Number((next.room.width * factor).toFixed(3))),
      height: String(Number((next.room.height * factor).toFixed(3))),
    });
  };
  const restore = (
    raw: unknown,
    revision: number,
    projectVersion = project.version
  ) => {
    const next = parseStudioDesign(raw);
    if (!next || next.projectId !== project.id) {
      setError(
        "This saved design is corrupt or incompatible. It was not overwritten. Select another design or start a new one."
      );
      return;
    }
    setHistory({ past: [], present: next, future: [] });
    setSaved(JSON.stringify(next));
    setSavedRevision(revision);
    setDesignRevisionChanged(false);
    setBaseVersion(projectVersion);
    setSelected(undefined);
    syncDimensions(next);
    setError("");
    loaded.current = next.id;
    onDesignId(next.id);
  };
  useEffect(() => {
    const requestedDesignId = designId ?? project.stoneStudioDesigns?.[0]?.design.id;
    if (!requestedDesignId || loaded.current === requestedDesignId) return;
    const entry = project.stoneStudioDesigns?.find(
      (d) => d.design.id === requestedDesignId
    );
    if (entry) restore(entry.design, entry.revision);
    else if (designId)
      setError(
        "The requested saved design is unavailable for this project. No existing design was overwritten."
      );
  }, [designId, project.id, project.version, project.stoneStudioDesigns]);
  const askReplace = (title: string, action: () => void) =>
    setDialog({
      title,
      description: dirty
        ? "Your unsaved design changes will be discarded. Previously saved designs remain in project history."
        : "Previously saved designs remain in project history.",
      label: "Continue",
      onConfirm: async () => action(),
    });
  const roomSurfaces = surfaces(design),
    surface = roomSurfaces.find((s) => s.id === selected);
  const active = design.options[design.activeOption];
  const rectangleGeometryEditable = design.schemaVersion === 1;
  const updateGeometry = (
    template?: "Living room" | "Bedroom" | "Office" | "Meeting / reception"
  ) => {
    if (!rectangleGeometryEditable) {
      setError("Room resizing is not available for polygon designs yet.");
      return;
    }
    try {
      const factor = design.room.unit === "ft" ? 0.3048 : 1;
      const preset = template ? createDesign(project.id, template) : undefined;
      const target = template
        ? preset!.room
        : {
            name: dimensions.name,
            length: Number(dimensions.length) * factor,
            width: Number(dimensions.width) * factor,
            height: Number(dimensions.height) * factor,
          };
      if (!target.name.trim()) throw new Error("Room name is required.");
      const next = resizeRoom(design, {
        name: target.name,
        length: target.length,
        width: target.width,
        height: target.height,
      });
      setDialog({
        title: template
          ? `Use ${template} geometry?`
          : "Update room dimensions?",
        description:
          "Both A and B retain their floor and interior-wall assignments with stable IDs. Areas and layout coverage will change and must be reviewed; no saved history is deleted.",
        label: "Update both options",
        onConfirm: async () => {
          change(preset ? { ...next, objects: preset.objects } : next);
          if (preset) setSelectedRoomObjectId(undefined);
          syncDimensions(next);
          setError("");
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid dimensions");
    }
  };
  const save = async () => {
    if (readOnly || busy || saveLock.current || dimensionsDirty) return;
    saveLock.current = true;
    setSavePending(true);
    try {
      const latest = await refresh();
      if (latest.id !== project.id)
        throw new Error("The latest project could not be confirmed. Your edits are retained.");
      const latestDesign = latest.stoneStudioDesigns?.find((entry) => entry.design.id === design.id);
      if ((savedRevision === undefined && latestDesign) ||
          (savedRevision !== undefined && latestDesign?.revision !== savedRevision)) {
        setDesignRevisionChanged(true);
        throw new Error("This saved design changed elsewhere. Your edits are retained; reload the latest saved version before saving.");
      }
      setBaseVersion(latest.version);
      const result = await command.run(
        "saveStudioDesign",
        { design },
        latest.version
      );
      const entry = result.stoneStudioDesigns?.find(
        (d) => d.design.id === design.id
      );
      if (!entry)
        throw new Error(
          "The server did not return the saved design. Review the latest project before retrying."
        );
      setSaved(JSON.stringify(design));
      setSavedRevision(entry.revision);
      setDesignRevisionChanged(false);
      setBaseVersion(result.version);
      loaded.current = design.id;
      onDesignId(design.id);
      setError("");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Design not saved");
    } finally {
      saveLock.current = false;
      setSavePending(false);
    }
  };
  const saveConflictCopy = async () => {
    if (readOnly || busy || saveLock.current || !designRevisionChanged) return;
    saveLock.current = true;
    setSavePending(true);
    try {
      const latest = await refresh();
      const copy = {
        ...design,
        id: crypto.randomUUID(),
        name: `${design.name} (copy)`.slice(0, 120),
      };
      const result = await command.run("saveStudioDesign", { design: copy }, latest.version);
      const entry = result.stoneStudioDesigns?.find((item) => item.design.id === copy.id);
      if (!entry) throw new Error("The server did not confirm the new design. Review the latest project before retrying.");
      setHistory({ past: [], present: copy, future: [] });
      setSaved(JSON.stringify(copy));
      setSavedRevision(entry.revision);
      setBaseVersion(result.version);
      setDesignRevisionChanged(false);
      loaded.current = copy.id;
      onDesignId(copy.id);
      syncDimensions(copy);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The new design could not be saved.");
    } finally {
      saveLock.current = false;
      setSavePending(false);
    }
  };
  const prepare = async () => {
    if (busy || prepareLock.current || dirty || dimensionsDirty || !savedRevision) return;
    if (designSummaries.some(q => q.option === design.activeOption && q.designRevision === savedRevision && q.geometryRevision === design.geometryRevision)) {
      setQuoteOpen(true);
      setError("");
      return;
    }
    prepareLock.current = true;
    setPreparePending(true);
    try {
      const result = await command.run(
        "prepareStudioQuote",
        {
          designId: design.id,
          option: design.activeOption,
          geometryRevision: design.geometryRevision,
          designRevision: savedRevision,
        },
        baseVersion
      );
      setBaseVersion(result.version);
      setQuoteOpen(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quote summary not prepared");
    } finally {
      prepareLock.current = false;
      setPreparePending(false);
    }
  };
  const selectedAssignment = selected
    ? active.assignments[selected]
    : undefined;
  const materialQuery = useMaterial(selectedAssignment?.assetId);
  const reference = chosenReference ?? materialQuery.data;
  const [materialInputs, setMaterialInputs] = useState<AssignmentInputs>({
    width: "",
    height: "",
    rotation: 0,
    mode: "surface",
    grout: "2",
    color: taruviTokens.hmg.border,
  });
  const [materialError, setMaterialError] = useState("");
  const [materialTab, setMaterialTab] = useState(0);
  const [roomItemSearch, setRoomItemSearch] = useState("");
  const [roomItemCategory, setRoomItemCategory] = useState("All items");
  const [selectedRoomObjectId, setSelectedRoomObjectId] = useState<string>();
  useEffect(() => {
    if (selectedAssignment)
      setMaterialInputs({
        width: String(selectedAssignment.widthM),
        height: String(selectedAssignment.heightM),
        rotation: selectedAssignment.rotation,
        mode: selectedAssignment.mode,
        grout: String(selectedAssignment.groutMm),
        color: selectedAssignment.groutColor,
      });
  }, [selected, design.activeOption, selectedAssignment]);
  const chooseMaterial = (ref: GalleryReference) => {
    setChosenReference(ref);
    setMaterialTab(1);
    if (readOnly || busy || !ref.surfaceEligible) return;
    const target = selected || `${design.room.id}:floor`;
    const inputs: AssignmentInputs = {
      ...materialInputs,
      mode: "surface",
      rotation: 0,
      grout: "0",
    };
    change(
      applyAssignment(design, target, parseAssignmentSettings(ref.id, inputs))
    );
    setSelected(target);
    setMaterialInputs(inputs);
    setMaterialError("");
  };
  const assign = (allWalls = false, automatic = false) => {
    try {
      const targetReference = automatic ? materialQuery.data : reference;
      if (
        readOnly ||
        busy ||
        !targetReference?.surfaceEligible ||
        (automatic && targetReference.id !== selectedAssignment?.assetId)
      )
        throw new Error("Select an approved surface material.");
      if (!allWalls && !selected)
        throw new Error("Select a floor or interior wall first.");
      const assignment = parseAssignmentSettings(
        targetReference.id,
        automatic
          ? {
              ...materialInputs,
              mode: "surface",
              rotation: selectedAssignment!.rotation,
              color: selectedAssignment!.groutColor,
            }
          : materialInputs
      );
      const next = applyAssignment(
        design,
        allWalls ? "all-walls" : selected!,
        assignment
      );
      if (allWalls)
        setDialog({
          title: "Apply to all interior walls?",
          description:
            "Replace every interior wall assignment in the active option only. Floor, other option and saved history stay unchanged.",
          label: "Apply to all walls",
          onConfirm: async () => {
            change(next);
            setMaterialError("");
          },
        });
      else {
        change(next);
        setMaterialError("");
      }
    } catch (e) {
      setMaterialError(
        e instanceof Error
          ? e.message
          : "Material assignment could not be applied."
      );
    }
  };
  const assignments = Object.keys(active.assignments).length;
  const itemCategory = (item: (typeof roomObjectCatalog)[number]) =>
    item.shape === "seat"
      ? "Seating"
      : item.shape === "table"
        ? "Tables & desks"
        : item.shape === "bed"
          ? "Bedroom"
          : item.shape === "cabinet"
            ? "Storage"
            : "Lighting";
  const itemCategories = [
    "All items",
    "Seating",
    "Tables & desks",
    "Bedroom",
    "Storage",
    "Lighting",
  ];
  const filteredRoomItems = roomObjectCatalog.filter((item) => {
    const searchText = `${item.label} ${item.kind} ${item.finish} ${itemCategory(item)}`.toLowerCase();
    return (
      (!roomItemSearch.trim() || searchText.includes(roomItemSearch.trim().toLowerCase())) &&
      (roomItemCategory === "All items" || itemCategory(item) === roomItemCategory)
    );
  });
  const placedRoomItems = (design.objects || []).map((item) => ({
    ...item,
    catalog: roomObjectCatalog.find((entry) => entry.catalogId === item.catalogId),
  }));
  const selectedRoomObject = placedRoomItems.find(
    (item) => item.id === selectedRoomObjectId
  );
  const addCatalogItem = (catalogId: string) => {
    const next = addRoomObject(design, catalogId);
    const added = next?.objects?.[next.objects.length - 1];
    if (!next || !added) {
      setError("There is not enough room to place this item. Resize the room or remove another item and try again.");
      return;
    }
    change(next);
    setSelectedRoomObjectId(added.id);
    setError("");
  };
  const moveSelectedItem = (dx: number, dz: number) => {
    if (!selectedRoomObject) return;
    const next = moveRoomObject(design, selectedRoomObject.id, {
      xM: selectedRoomObject.xM + dx,
      zM: selectedRoomObject.zM + dz,
    });
    if (!next) {
      setError("That move would place the item outside the room. The item was not moved.");
      return;
    }
    change(next);
    setError("");
  };
  const moveItemFromViewport = (id: string, position: { xM: number; zM: number }) => {
    const next = moveRoomObject(design, id, position);
    if (!next) {
      setError("That position overlaps another item or crosses the room boundary. The item was not moved.");
      return;
    }
    setSelectedRoomObjectId(id);
    change(next);
    setError("");
  };
  const rotateSelectedItem = () => {
    if (!selectedRoomObject) return;
    const next = rotateRoomObject(design, selectedRoomObject.id, 90);
    if (!next) {
      setError("This item cannot rotate in its current position. Move it away from the room edge first.");
      return;
    }
    change(next);
    setError("");
  };
  const roomPanel = (
    <Panel title="Room & surfaces">
      <Stack gap={2}>
        <Typography variant="h3">Select a surface</Typography>
        {roomSurfaces.map((s) => (
          <Button
            key={s.id}
            variant={selected === s.id ? "contained" : "outlined"}
            aria-pressed={selected === s.id}
            onClick={() => setSelected(s.id)}
            sx={{ justifyContent: "space-between" }}
          >
            {s.name}
            <span>{s.area.toFixed(2)} m2</span>
          </Button>
        ))}
        <Button disabled={!selected} onClick={() => setSelected(undefined)}>
          Clear selection
        </Button>

        <Accordion slotProps={{ transition: { unmountOnExit: true } }}>
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
            Room geometry & saved designs
          </AccordionSummary>
          <AccordionDetails>
            <Stack gap={2}>
              <TextField
                label="Saved design"
                disabled={busy}
                select
                SelectProps={{ MenuProps: { container: workspaceRef.current } }}
                value={
                  project.stoneStudioDesigns?.some(
                    (d) => d.design.id === design.id
                  )
                    ? design.id
                    : ""
                }
                onChange={(e) => {
                  const entry = project.stoneStudioDesigns?.find(
                    (d) => d.design.id === e.target.value
                  );
                  if (entry)
                    askReplace("Open saved design?", () =>
                      restore(entry.design, entry.revision)
                    );
                }}
              >
                <MenuItem value="">Unsaved design</MenuItem>
                {project.stoneStudioDesigns?.map((d) => (
                  <MenuItem key={d.design.id} value={d.design.id}>
                    {d.design.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                disabled={readOnly || busy}
                onClick={() =>
                  askReplace("Start a new design?", () => {
                    const next = initial();
                    setHistory({ past: [], present: next, future: [] });
                    setSaved("");
                    setSavedRevision(undefined);
                    setDesignRevisionChanged(false);
                    setBaseVersion(project.version);
                    syncDimensions(next);
                    setSelected(undefined);
                    loaded.current = next.id;
                    onDesignId(next.id);
                  })
                }
              >
                New room design
              </Button>
              <Button
                disabled={busy || !savedRevision}
                onClick={() =>
                  askReplace("Reload latest saved design?", () => {
                    void refresh()
                      .then((latest) => {
                        const entry = latest.stoneStudioDesigns?.find(
                          (d) => d.design.id === design.id
                        );
                        if (entry)
                          restore(entry.design, entry.revision, latest.version);
                        else
                          setError("The saved design is no longer available.");
                      })
                      .catch(() =>
                        setError(
                          "Latest saved design could not be loaded. Current edits remain."
                        )
                      );
                  })
                }
              >
                Reload saved design
              </Button>
              <TextField
                label="Design name"
                value={design.name}
                inputProps={{ maxLength: 120 }}
                disabled={readOnly || busy}
                onChange={(e) => change({ ...design, name: e.target.value })}
              />
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {(["Living room", "Bedroom", "Office", "Meeting / reception"] as const).map((t) => (
                  <Button
                    key={t}
                    size="small"
                    disabled={readOnly || busy || !rectangleGeometryEditable}
                    onClick={() => updateGeometry(t)}
                  >
                    {t}
                  </Button>
                ))}
              </Stack>
              <Typography variant="body2">
                Generic editable room templates, not HMG installations.
                Rectangular geometry only; arbitrary corner editing is not
                enabled.
              </Typography>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  Add room items ({placedRoomItems.length} placed)
                </AccordionSummary>
                <AccordionDetails>
                  <Stack gap={1.5}>
                    <Typography variant="body2">
                      Drag an item directly in the 3D view to reposition it. Arrows move the selected item by 0.25 m. Items cannot overlap or cross room boundaries; undo and redo include item changes.
                    </Typography>
                    <TextField
                      label="Find room items"
                      value={roomItemSearch}
                      onChange={(event) => setRoomItemSearch(event.target.value)}
                      disabled={readOnly || busy}
                    />
                    <TextField
                      label="Item category"
                      select
                      SelectProps={{ MenuProps: { container: workspaceRef.current } }}
                      value={roomItemCategory}
                      onChange={(event) => setRoomItemCategory(event.target.value)}
                      disabled={readOnly || busy}
                    >
                      {itemCategories.map((category) => (
                        <MenuItem key={category} value={category}>{category}</MenuItem>
                      ))}
                    </TextField>
                    <Stack gap={1} aria-label="Room item catalogue">
                      {filteredRoomItems.length ? filteredRoomItems.map((item) => (
                        <Box key={item.catalogId} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                          <Typography fontWeight={600}>{item.label}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {itemCategory(item)} · {item.widthM} × {item.depthM} × {item.heightM} m · {item.finish}
                          </Typography>
                          <Button
                            size="small"
                            disabled={readOnly || busy}
                            onClick={() => addCatalogItem(item.catalogId)}
                          >
                            Add {item.label}
                          </Button>
                        </Box>
                      )) : (
                        <Typography role="status" color="text.secondary">No catalogue items match that search.</Typography>
                      )}
                    </Stack>
                    <Typography variant="h3">Placed room items</Typography>
                    {placedRoomItems.length ? placedRoomItems.map((item) => (
                      <Button
                        key={item.id}
                        aria-label={`Select ${item.catalog?.label || item.kind}`}
                        variant={item.id === selectedRoomObjectId ? "contained" : "outlined"}
                        aria-pressed={item.id === selectedRoomObjectId}
                        onClick={() => setSelectedRoomObjectId(item.id)}
                        sx={{ justifyContent: "space-between", textAlign: "left" }}
                      >
                        <span>{item.catalog?.label || item.kind}</span>
                        <span>{item.xM} m, {item.zM} m</span>
                      </Button>
                    )) : <Typography variant="body2">No furniture placed yet.</Typography>}
                    {selectedRoomObject && (
                      <Stack gap={1}>
                        <Typography variant="body2" aria-live="polite">
                          Position: {selectedRoomObject.xM} m, {selectedRoomObject.zM} m
                        </Typography>
                        <Typography variant="body2">Rotation: {selectedRoomObject.rotationDeg}°</Typography>
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                          <Button size="small" aria-label="Move selected item left" disabled={readOnly || busy} onClick={() => moveSelectedItem(-0.25, 0)}>Left</Button>
                          <Button size="small" aria-label="Move selected item right" disabled={readOnly || busy} onClick={() => moveSelectedItem(0.25, 0)}>Right</Button>
                          <Button size="small" aria-label="Move selected item forward" disabled={readOnly || busy} onClick={() => moveSelectedItem(0, -0.25)}>Forward</Button>
                          <Button size="small" aria-label="Move selected item back" disabled={readOnly || busy} onClick={() => moveSelectedItem(0, 0.25)}>Back</Button>
                          <Button size="small" disabled={readOnly || busy} onClick={rotateSelectedItem}>Rotate selected item</Button>
                          <Button
                            size="small"
                            color="error"
                            disabled={readOnly || busy}
                            onClick={() => setDialog({
                              title: `Remove ${selectedRoomObject.catalog?.label || "room item"}?`,
                              description: "This removes the item from this unsaved room design. Undo is available until the design is saved.",
                              label: "Remove item",
                              onConfirm: async () => {
                                change(removeRoomObject(design, selectedRoomObject.id));
                                setSelectedRoomObjectId(undefined);
                              },
                            })}
                          >Remove selected item</Button>
                        </Stack>
                      </Stack>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
              <TextField
                label="Room name"
                value={dimensions.name}
                inputProps={{ maxLength: 120 }}
                onChange={(e) =>
                  setDimensions((d) => ({ ...d, name: e.target.value }))
                }
                disabled={readOnly || busy || !rectangleGeometryEditable}
              />
              <TextField
                label="Display units"
                select
                SelectProps={{ MenuProps: { container: workspaceRef.current } }}
                value={design.room.unit}
                disabled={readOnly || busy || !rectangleGeometryEditable}
                onChange={(e) => {
                  if (!rectangleGeometryEditable) return;
                  const next = resizeRoom(design, {
                    unit: e.target.value as "m" | "ft",
                  });
                  change(next);
                  syncDimensions(next);
                }}
              >
                <MenuItem value="m">Metres</MenuItem>
                <MenuItem value="ft">Feet</MenuItem>
              </TextField>
              {(["length", "width", "height"] as const).map((key) => (
                <TextField
                  key={key}
                  label={`${key[0].toUpperCase() + key.slice(1)} (${
                    design.room.unit
                  })`}
                  type="number"
                  value={dimensions[key]}
                  inputProps={{ step: 0.01 }}
                  disabled={readOnly || busy || !rectangleGeometryEditable}
                  onChange={(e) =>
                    setDimensions((d) => ({ ...d, [key]: e.target.value }))
                  }
                />
              ))}
              <Button
                variant="outlined"
                disabled={readOnly || busy || !rectangleGeometryEditable}
                onClick={() => updateGeometry()}
              >
                Update dimensions
              </Button>
              <Typography variant="body2">
                Length/width: 1-20 m; wall height: 2-6 m. Dimensions are user
                estimates, not measured quantities.
              </Typography>
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Stack>
    </Panel>
  );
  const materials = (
    <Stack spacing={2}>
      <Typography variant="h3">HMG stone materials</Typography>
      <Typography>
        Currently assigned to {surface?.name || "no selected surface"}:{" "}
        {selectedAssignment
          ? materialQuery.data?.title || selectedAssignment.assetId
          : "None"}
      </Typography>
      {chosenReference && (
        <Alert severity="info">
          Selected stone: {chosenReference.title}. Eligible stones apply
          immediately to the selected surface (floor by default). Layout changes
          use Apply.
        </Alert>
      )}
      {selectedAssignment && chosenReference && (
        <Button
          onClick={() => {
            setChosenReference(undefined);
            setMaterialInputs({
              width: String(selectedAssignment.widthM),
              height: String(selectedAssignment.heightM),
              rotation: selectedAssignment.rotation,
              mode: selectedAssignment.mode,
              grout: String(selectedAssignment.groutMm),
              color: selectedAssignment.groutColor,
            });
          }}
        >
          Inspect currently assigned material
        </Button>
      )}
      <Tabs
        value={materialTab}
        onChange={(_, v) => setMaterialTab(v)}
        variant="fullWidth"
      >
        <Tab label="Stones" />
        <Tab label="Layout" />
      </Tabs>
      {materialTab === 0 ? (
        <>
          <GalleryBrowser
            compact
            mode="materials"
            container={workspaceRef.current}
            selectedId={reference?.id}
            onSelect={chooseMaterial}
          />
        </>
      ) : (
        <>
          <Box
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              bgcolor: "background.paper",
              py: 1,
            }}
          >
            <Typography variant="body2">
              Target: {surface?.name || "Select a surface"} / Option{" "}
              {design.activeOption}
            </Typography>
            <Button
              disabled={
                readOnly ||
                busy ||
                !reference?.surfaceEligible ||
                !selected
              }
              variant="contained"
              onClick={() => assign()}
            >
              Apply to selected surface
            </Button>
            <Button
              disabled={readOnly || busy || !reference?.surfaceEligible}
              onClick={() => assign(true)}
            >
              Apply to all interior walls
            </Button>
          </Box>
          {reference && (
            <>
              <Typography variant="h3">{reference.title}</Typography>
              <Accordion slotProps={{ transition: { unmountOnExit: true } }}>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  Published material details
                </AccordionSummary>
                <AccordionDetails>
                  <Stack gap={1}>
                    <Typography>
                      Type: {reference.stoneType || "Not published"} / Colour:{" "}
                      {reference.colour || "Not published"}
                    </Typography>
                    {reference.description && (
                      <Typography variant="body2">
                        Published description: {reference.description}
                      </Typography>
                    )}
                    <Alert severity="info">
                      Watermarked official photographic preview, not a seamless
                      texture or guaranteed slab. Published finish, thickness
                      and other descriptions are shown as supplied; preview
                      dimensions below remain user assumptions.
                    </Alert>
                    <Typography>
                      {reference.sourceCaption ||
                        "Gallery reference; no verified product identity"}
                    </Typography>
                    <Button
                      component="a"
                      href={reference.sourcePageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Approved source page
                    </Button>
                    <Typography variant="body2">
                      {reference.width} / {reference.height} px /{" "}
                      {reference.eligibilityReason}
                    </Typography>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </>
          )}
          {reference && !reference.surfaceEligible && (
            <Alert severity="warning">
              This reference is not approved for surface mapping. Inspiration
              photographs cannot be stretched onto room surfaces.
            </Alert>
          )}
          {!reference && (
            <Alert severity="info">
              Choose a verified HMG material, then select a floor or interior
              wall. Product colour/type come only from official metadata.
            </Alert>
          )}
          {materialQuery.error && (
            <Alert severity="warning">
              Saved material metadata is unavailable; its assignment is
              retained.
              <Button onClick={() => materialQuery.refetch()}>
                Retry material details
              </Button>
            </Alert>
          )}
          <Button
            variant="outlined"
            disabled={
              readOnly ||
              busy ||
              !materialQuery.data?.surfaceEligible ||
              materialQuery.data?.id !== selectedAssignment?.assetId ||
              !selected
            }
            onClick={() => assign(false, true)}
          >
            Fit image to surface
          </Button>
          <Typography variant="h3">Preview layout</Typography>
          <Typography variant="body2">
            Automatic surface preview needs no physical dimensions. The whole
            image fills the surface without cropping; proportions adapt to the
            surface and are not measured slab dimensions. Advanced tile/slab
            sizes are user assumptions, not suitability or stock evidence.
          </Typography>
          <TextField
            select
            SelectProps={{ MenuProps: { container: workspaceRef.current } }}
            label="Layout mode"
            value={materialInputs.mode}
            disabled={readOnly || !reference?.surfaceEligible}
            onChange={(e) =>
              setMaterialInputs((i) => ({
                ...i,
                mode: e.target.value as AssignmentInputs["mode"],
                ...(i.mode === "surface"
                  ? {
                      width: String(
                        Math.min(10, surface?.width || design.room.length)
                      ),
                      height: String(
                        Math.min(10, surface?.height || design.room.width)
                      ),
                      grout: "2",
                    }
                  : {}),
              }))
            }
          >
            <MenuItem value="surface">Automatic surface preview</MenuItem>
            <MenuItem value="tile">Advanced straight tile grid</MenuItem>
            <MenuItem value="slab">Advanced single slab</MenuItem>
          </TextField>
          {materialInputs.mode !== "surface" && (
            <Box
              sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}
            >
              {(["width", "height"] as const).map((key) => (
                <TextField
                  key={key}
                  label={`Preview ${key} (m)`}
                  type="number"
                  required
                  value={materialInputs[key]}
                  inputProps={{ min: 0.05, max: 10, step: 0.01 }}
                  disabled={readOnly || !reference?.surfaceEligible}
                  onChange={(e) =>
                    setMaterialInputs((i) => ({ ...i, [key]: e.target.value }))
                  }
                />
              ))}
            </Box>
          )}
          {materialInputs.mode !== "surface" &&
            reference &&
            (() => {
              const ratio =
                Number(materialInputs.width) / Number(materialInputs.height);
              const source =
                materialInputs.rotation === 90
                  ? reference.height / reference.width
                  : reference.width / reference.height;
              return Number.isFinite(ratio) &&
                Math.min(ratio / source, source / ratio) < 0.25 ? (
                <Alert severity="warning">
                  This extreme aspect ratio leaves most of the tile/slab as
                  padding. Use Fit image to surface for a filled preview, or
                  adjust the assumed dimensions.
                </Alert>
              ) : null;
            })()}
          <TextField
            select
            SelectProps={{ MenuProps: { container: workspaceRef.current } }}
            label="Vein rotation"
            value={materialInputs.rotation}
            disabled={readOnly || !reference?.surfaceEligible}
            onChange={(e) =>
              setMaterialInputs((i) => ({
                ...i,
                rotation: Number(e.target.value) as 0 | 90,
              }))
            }
          >
            <MenuItem value={0}>0 degrees</MenuItem>
            <MenuItem value={90}>90 degrees</MenuItem>
          </TextField>
          {materialInputs.mode === "tile" ? (
            <>
              <TextField
                label="Grout width (mm)"
                type="number"
                value={materialInputs.grout}
                inputProps={{ min: 0, max: 20, step: 0.5 }}
                disabled={readOnly || !reference?.surfaceEligible}
                onChange={(e) =>
                  setMaterialInputs((i) => ({ ...i, grout: e.target.value }))
                }
              />
              <TextField
                label="Grout colour"
                type="color"
                value={materialInputs.color}
                disabled={readOnly || !reference?.surfaceEligible}
                onChange={(e) =>
                  setMaterialInputs((i) => ({ ...i, color: e.target.value }))
                }
              />
            </>
          ) : materialInputs.mode === "slab" ? (
            <Alert severity="info">
              One slab only. Surface area outside the specified slab is
              incomplete and stays visibly uncovered; no seamless or bookmatched
              layout is implied.
            </Alert>
          ) : null}
          {materialError && <Alert severity="error">{materialError}</Alert>}
          {!selected && (
            <Typography>
              Select a floor or interior wall to inspect its assignment.
            </Typography>
          )}
          {selected && active.assignments[selected] && (
            <>
              <Alert severity="warning">
                Saved assignment {active.assignments[selected].assetId} is
                retained is stored with this option. If its image fails, the
                renderer retains the assignment and shows an explicit
                unavailable state.
              </Alert>
              <Button
                disabled={readOnly || busy}
                onClick={() => {
                  const next = { ...active.assignments };
                  delete next[selected];
                  change({
                    ...design,
                    options: {
                      ...design.options,
                      [design.activeOption]: { assignments: next },
                    },
                  });
                }}
              >
                Clear this surface assignment
              </Button>
            </>
          )}
        </>
      )}
    </Stack>
  );
  return (
    <Stack
      ref={workspaceRef}
      spacing={2}
      sx={{
        bgcolor: "background.default",
        minWidth: 0,
        ...(fullscreen ? { height: "100vh", overflow: "auto", p: 2 } : {}),
      }}
    >
      <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
        <Typography variant="h3" sx={{ flex: 1 }}>
          {project.name} / {design.room.name}
        </Typography>
        <Chip
          label={
            busy
              ? "Saving..."
              : error
              ? "Not saved"
              : dirty
              ? "Unsaved changes"
              : "Saved on Taruvi"
          }
        />
        <Button
          variant={view === "2d" ? "contained" : "outlined"}
          onClick={() => setView("2d")}
        >
          2D Plan
        </Button>
        <Button
          variant={view === "3d" ? "contained" : "outlined"}
          onClick={() => setView("3d")}
        >
          3D View
        </Button>
        <Button
          variant={view === "home" ? "contained" : "outlined"}
          disabled={!wholeHomeLayout}
          onClick={() => setView("home")}
        >
          Whole home
        </Button>
        <Button
          disabled={
            readOnly || busy || dimensionsDirty || !design.name.trim()
          }
          variant="contained"
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button
          disabled={readOnly || busy || dirty || !savedRevision}
          onClick={() => void prepare()}
        >
          Prepare quote
        </Button>
      </Stack>
      {(dirty || !savedRevision) && (
        <Typography variant="body2" color="text.secondary" role="status">
          Save the current room design before preparing its quote summary.
        </Typography>
      )}
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <Button onClick={() => setRoomOpen((v) => !v)}>
          {roomOpen ? "Hide room controls" : "Show room controls"}
        </Button>
        <Button
          sx={{ display: { xs: "none", lg: "inline-flex" } }}
          onClick={() => setMaterialPanelOpen((v) => !v)}
        >
          {materialPanelOpen ? "Hide materials" : "Show materials"}
        </Button>
        <Button
          startIcon={
            fullscreen ? (
              <FullscreenExitRoundedIcon />
            ) : (
              <FullscreenRoundedIcon />
            )
          }
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? "Exit fullscreen" : "Fullscreen workspace"}
        </Button>
      </Stack>
      {fullscreenError && <Alert severity="info">{fullscreenError}</Alert>}
      {dimensionsDirty && (
        <Alert severity="info">
          Dimensions have not been applied. Use Update dimensions before saving
          or preparing a quote.
        </Alert>
      )}
      {!project.archived && readOnly && (
        <Alert severity="info">
          Your role has read-only access to room designs. You can inspect saved
          rooms and compare their options.
        </Alert>
      )}
      {project.archived && (
        <Alert severity="info">
          Archived project - inspect saved designs, but editing, saving and
          quote preparation are disabled.
        </Alert>
      )}
      {(error || command.error) && (
        <Alert
          severity={designRevisionChanged ? "warning" : "error"}
          action={designRevisionChanged && !readOnly ? (
            <Button size="small" disabled={busy} onClick={() => void saveConflictCopy()}>
              Save edits as new design
            </Button>
          ) : undefined}
        >
          {error || command.error} Your current design is retained.
        </Alert>
      )}
      <ConflictRecovery
        container={workspaceRef.current}
        version={command.conflictVersion}
        refresh={refresh}
        onRebase={(v) => {
          setBaseVersion(command.rebase(v));
          const latest = project.stoneStudioDesigns?.find(
            (d) => d.design.id === design.id
          )?.design;
          if (latest)
            setHistory((h) => ({
              ...h,
              present: reconcileGeometryRevision(
                { ...latest, camera: h.present.camera },
                h.present
              ),
            }));
          setError("");
        }}
      />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <Button
          startIcon={<UndoRoundedIcon />}
          disabled={!history.past.length || readOnly || busy}
          onClick={() => {
            const next = undoHistory(history);
            setHistory({
              ...next,
              present: reconcileGeometryRevision(
                design,
                next.present,
                project.stoneStudioDesigns?.find(
                  (d) => d.design.id === design.id
                )?.design.geometryRevision
              ),
            });
            syncDimensions(next.present);
          }}
        >
          Undo
        </Button>
        <Button
          startIcon={<RedoRoundedIcon />}
          disabled={!history.future.length || readOnly || busy}
          onClick={() => {
            const next = redoHistory(history);
            setHistory({
              ...next,
              present: reconcileGeometryRevision(
                design,
                next.present,
                project.stoneStudioDesigns?.find(
                  (d) => d.design.id === design.id
                )?.design.geometryRevision
              ),
            });
            syncDimensions(next.present);
          }}
        >
          Redo
        </Button>
        <Chip label={`Compare / Option ${design.activeOption}`} />
        {(["A", "B"] as const).map((option) => (
          <Button
            key={option}
            aria-pressed={design.activeOption === option}
            variant={design.activeOption === option ? "contained" : "outlined"}
            onClick={() => change({ ...design, activeOption: option })}
          >
            Option {option}
          </Button>
        ))}
        <Button
          disabled={readOnly || busy}
          onClick={() =>
            setDialog({
              title: `Capture Option ${
                design.activeOption === "A" ? "B" : "A"
              } from ${design.activeOption}?`,
              description:
                "Replace the other option's complete assignments with this option. Shared room geometry and camera remain unchanged. Undo is available before saving.",
              label: "Capture option",
              onConfirm: async () => {
                const other = design.activeOption === "A" ? "B" : "A";
                change({
                  ...design,
                  options: {
                    ...design.options,
                    [other]: JSON.parse(JSON.stringify(active)),
                  },
                });
              },
            })
          }
        >
          Capture other option
        </Button>
        <Typography variant="body2" alignSelf="center">
          Same geometry and camera / {assignments} assigned surfaces
        </Typography>
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: `${roomOpen ? "240px " : ""}minmax(0,1fr)${
              materialPanelOpen ? ` 8px ${materialPanelWidth}px` : ""
            }`,
          },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Box
          sx={{
            display: { xs: "none", lg: roomOpen ? "block" : "none" },
            maxHeight: fullscreen ? "75vh" : 760,
            overflow: "auto",
          }}
        >
          {roomPanel}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Accordion
            sx={{ display: { xs: roomOpen ? "block" : "none", lg: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              Room & surfaces
            </AccordionSummary>
            <AccordionDetails>{roomPanel}</AccordionDetails>
          </Accordion>
          <Box
            sx={{
              height: view === "home" ? "auto" : fullscreen
                ? "calc(100vh - 245px)"
                : { xs: 460, md: "min(74vh,850px)" },
              minWidth: 0,
            }}
          >
            {view === "home" && wholeHomeLayout ? (
              <FullHomePlanViewer layout={wholeHomeLayout} assignments={wholeHomeAssignments} openings={wholeHomeUpload?.extraction?.openings || []}
                activeRoomId={activePlanRoomId}
                onEditRoom={(roomId, surface = 'floor') => {
                  if (busy) return;
                  const index = wholeHomeUpload?.reviewed?.rooms.findIndex(room=>room.id===roomId) ?? -1;
                  const id = wholeHomeUpload?.generatedDesignIds[index];
                  const entry = project.stoneStudioDesigns?.find(item=>item.design.id===id);
                  if (!entry) {setError('Generate and save this room from Plan to 3D before editing its stones.');return;}
                  const select = (room:StudioDesign['room']) => setSelected(surface === 'floor' ? `${room.id}:floor` : room.wallSideIds[['north','east','south','west'].indexOf(surface)]);
                  if (id === design.id) {select(design.room);return;}
                  if (dimensionsDirty) {setError('Apply or cancel the current dimension edits before switching rooms.');return;}
                  const open = (source = project) => {
                    const target=source.stoneStudioDesigns?.find(item=>item.design.id===id);
                    if (!target) throw new Error('The selected room is no longer available.');
                    restore(target.design,target.revision,source.version);
                    select(target.design.room);
                    setChosenReference(undefined);
                    setMaterialTab(0);
                  };
                  if (dirty) setDialog({
                    title:'Save changes and switch rooms?',
                    description:'Save your current room before switching. Its stone selections will remain visible in the whole-home design.',
                    label:'Save and switch',
                    onConfirm:async () => {
                      const result=await save();
                      if (!result) throw new Error('The current room was not saved. Your edits are retained; resolve the save error before switching.');
                      open(result);
                    },
                  }); else open();
                }} />
            ) : (
              <BlueprintViewport
                document={design}
                view={view === "home" ? "3d" : view}
                selectedSurfaceId={selected}
                onSelectSurface={(id) => setSelected(id || undefined)}
                onRoomObjectSelect={setSelectedRoomObjectId}
                onRoomObjectMove={moveItemFromViewport}
                onCameraChange={(camera) =>
                  setHistory((h) => ({ ...h, present: { ...h.present, camera } }))
                }
                onStatus={setStatus}
                resetViewKey={resetKey}
              />
            )}
          </Box>
          <Stack direction="row" flexWrap="wrap" gap={1} mt={1}>
            <Button onClick={() => setResetKey((v) => v + 1)}>
              Reset view
            </Button>
            <Button
              sx={{ display: { lg: "none" } }}
              onClick={() => setMaterialsOpen(true)}
            >
              Materials
            </Button>
            <Typography variant="body2" role="status">
              {view === "home" ? "Whole-home schematic preview. Select a room design for detailed surface editing." : status}
            </Typography>
          </Stack>
          {surface && (
            <Alert severity="info">
              {surface.name} / {surface.width.toFixed(2)} ?{" "}
              {surface.height.toFixed(2)} m / {surface.area.toFixed(2)} m2
              preliminary area
            </Alert>
          )}
          <Typography variant="body2" mt={1}>
            Material previews use official HMG imagery with assumed physical
            layout. Orbit and zoom in 3D; the keyboard surface list selects the
            same exact interior faces. If WebGL fails, continue with 2D Plan.
          </Typography>
        </Box>
        {materialPanelOpen && <Box
          role="separator"
          aria-label="Resize stone materials panel"
          aria-orientation="vertical"
          aria-valuemin={MATERIAL_WIDTH_MIN}
          aria-valuemax={MATERIAL_WIDTH_MAX}
          aria-valuenow={materialPanelWidth}
          aria-valuetext={`${materialPanelWidth} pixels`}
          aria-controls="studio-material-panel"
          tabIndex={0}
          onPointerDown={startMaterialResize}
          onPointerMove={moveMaterialResize}
          onPointerUp={endMaterialResize}
          onPointerCancel={endMaterialResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              resizeMaterialPanel(materialPanelWidth + 16);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              resizeMaterialPanel(materialPanelWidth - 16);
            } else if (event.key === "Home") {
              event.preventDefault();
              resizeMaterialPanel(MATERIAL_WIDTH_MIN);
            } else if (event.key === "End") {
              event.preventDefault();
              resizeMaterialPanel(MATERIAL_WIDTH_MAX);
            }
          }}
          sx={{
            display: { xs: "none", lg: "flex" },
            alignItems: "center",
            justifyContent: "center",
            minHeight: 240,
            cursor: "col-resize",
            touchAction: "none",
            userSelect: "none",
            outline: "none",
            "&:focus-visible": { outline: `2px solid ${taruviTokens.hmg.olive}`, outlineOffset: 1 },
            "&:hover > span, &:focus-visible > span": { backgroundColor: taruviTokens.hmg.olive },
          }}
        >
          <Box component="span" aria-hidden="true" sx={{ width: 3, height: 42, borderRadius: 4, bgcolor: "divider" }} />
        </Box>}
        <Box
          id="studio-material-panel"
          sx={{
            display: { xs: "none", lg: materialPanelOpen ? "block" : "none" },
            maxHeight: fullscreen ? "75vh" : 760,
            overflow: "auto",
          }}
        >
          <Panel>{materials}</Panel>
        </Box>
      </Box>
      <Drawer
        container={workspaceRef.current}
        anchor="bottom"
        open={materialsOpen}
        onClose={() => setMaterialsOpen(false)}
      >
        <Box sx={{ p: 2, maxHeight: "80vh", overflow: "auto" }}>
          <Button onClick={() => setMaterialsOpen(false)}>
            Close materials
          </Button>
          {materials}
        </Box>
      </Drawer>
      <Panel
        title={`Prepared quote summaries (${
          project.studioQuoteSummaries?.length || 0
        })`}
      >
        <Typography>
          No pricing draft is created automatically. These reviewable project
          summaries use preliminary geometric coverage only, with no stock or
          suitability claim.
        </Typography>
        {project.studioQuoteSummaries
          ?.filter((q) => q.designId === design.id)
          .map((q) => (
            <Button key={q.id} onClick={() => setQuoteOpen(true)}>
              Review Option {q.option} / {q.totalAreaM2} m2 / {q.status}
            </Button>
          ))}
      </Panel>
      <Dialog
        container={workspaceRef.current}
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Unpriced studio quote review</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            {latestSummaries.map((q) => (
                <Box key={q.id}>
                  <Typography variant="h3">
                    Option {q.option} / Geometry revision {q.geometryRevision}
                  </Typography>
                  <Typography>
                    {dirty || q.designRevision !== savedRevision
                      ? "Historical summary - design changed. "
                      : ""}
                    {q.status} / Total {q.totalAreaM2} m2
                  </Typography>
                  {q.lines.map((line) => (
                    <Typography key={line.surfaceId}>
                      {line.name}: {line.areaM2} m2 / Reference{" "}
                      {line.assetId || "Unassigned"}
                    </Typography>
                  ))}
                  <Typography>
                    Assumptions: {q.assumptions.join("; ")}
                  </Typography>
                  <Typography>Excluded: {q.exclusions.join("; ")}</Typography>
                  {context?.canPrice ? (
                    <Button
                      disabled={
                        readOnly ||
                        busy ||
                        dirty ||
                        q.designRevision !== savedRevision ||
                        !q.lines.some((l) => l.assetId)
                      }
                      onClick={() => {
                        setQuoteOpen(false);
                        setDialog({
                          title: project.quote
                            ? "Replace working quotation draft?"
                            : "Create staff quotation draft?",
                          description: project.quote
                            ? "Previous quote history is retained. Replacing its source clears pricing and approval; enter new rates and obtain any required review."
                            : "Create a quote from this immutable summary. Pricing fields start blank; no fictional rates, orders or external messages.",
                          label: project.quote
                            ? "Replace working draft"
                            : "Create quotation draft",
                          onConfirm: async () => {
                            const result = await command.run(
                              "createStudioQuoteDraft",
                              {
                                summaryId: q.id,
                                ...(project.quote
                                  ? { replaceExisting: true }
                                  : {}),
                              },
                              baseVersion
                            );
                            navigate(`/quotes/${result.id}`);
                          },
                        });
                      }}
                    >
                      Create quotation draft from this summary
                    </Button>
                  ) : (
                    <Alert severity="info">
                      This is an unpriced quotation request/summary for your
                      assigned consultant. Only authorized pricing staff can
                      enter rates and create a commercial draft. No message or
                      order has been sent.
                    </Alert>
                  )}
                  <Button component={RouterLink} to="/design-dashboard">
                    Continue in Design Dashboard
                  </Button>
                </Box>
              ))}
            {historicalSummaries.length > 0 && <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography>Summary history ({historicalSummaries.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack gap={2}>
                  {historicalSummaries.map(q => <Box key={q.id}>
                    <Typography variant="h3">Option {q.option} / Design revision {q.designRevision} / Geometry revision {q.geometryRevision}</Typography>
                    <Typography>Historical summary / Total {q.totalAreaM2} m2</Typography>
                    {q.lines.map(line => <Typography key={line.surfaceId}>{line.name}: {line.areaM2} m2 / Reference {line.assetId || "Unassigned"}</Typography>)}
                  </Box>)}
                </Stack>
              </AccordionDetails>
            </Accordion>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuoteOpen(false)}>Close review</Button>
        </DialogActions>
      </Dialog>
      <CommandDialog
        container={workspaceRef.current}
        spec={dialog}
        close={() => setDialog(null)}
      />
    </Stack>
  );
}
