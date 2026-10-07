import { useLogin, useNotification } from "@refinedev/core";
import { EvidenceDrawer } from "../../features/hmg/components/EvidenceDrawer";
import { useWorkspace } from "../../features/hmg/components/AppShell";
import { useState, useEffect, useRef } from "react";
import {
  Link as RouterLink,
  useNavigate,
  useSearchParams,
  useParams,
} from "react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import { GalleryBrowser } from "../../features/hmg/components/GalleryBrowser";
import { getDesignInspiration } from "../../features/hmg/components/designInspiration";
import { PageContainer } from "../../components";
import { workflow, useWorkflow, useCatalogue, hasHmgSession } from "../../features/hmg/api";
import type { HmgList, HmgOption, HmgProject } from "../../features/hmg/types";
import {
  ConflictRecovery,
  EmptyState,
  LoadError,
  LoadingState,
  NextLink,
  PageHeading,
  Panel,
  ReferenceUnavailable,
  columnGrid,
} from "../../features/hmg/components/common";

export function Studio() {
  const context = useWorkspace();
  const authenticated = hasHmgSession();
  const {mutate:login}=useLogin();
  const {open:notify}=useNotification();
  const { optionId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(params.get("q") || "");
  const search = params.get("q") || "";
  const tone = params.get("tone") || "";
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("size") || 10);
  const update = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });
  useEffect(() => {
    const id = setTimeout(() => {
      if (input !== search) update("q", input);
    }, 350);
    return () => clearTimeout(id);
  }, [input]);
  const options = useCatalogue<HmgList<HmgOption>>({
    search,
    tone,
    page,
    pageSize,
  });
  const [projectSearch,setProjectSearch]=useState("");
  const [projectPage,setProjectPage]=useState(1);
  const projects = useWorkflow<HmgList<HmgProject>>("listProjects", undefined, {
    page: projectPage, search:projectSearch,
    pageSize: 10,
  }, authenticated && !!context);
  const [evidence,setEvidence]=useState<HmgOption>();
  const [detail, setDetail] = useState<HmgOption | null>(null);
  const [failedDirectionImages, setFailedDirectionImages] = useState<Set<string>>(
    () => new Set(),
  );
  const detailQuery = useCatalogue<HmgOption>(
    { optionId },
    !!optionId
  );
  useEffect(() => {
    if (detailQuery.data) setDetail(detailQuery.data);
  }, [detailQuery.data]);
  const closeDetail = () => {
    setDetail(null);
    if (optionId) navigate("/studio");
  };
  const [compare, setCompare] = useState<HmgOption[]>([]);
  const [saving, setSaving] = useState<HmgOption | null>(null);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const savingLock = useRef(false);
  const [conflictVersion,setConflictVersion]=useState<number>();
  const failureCode=useRef<string>();
  const reviewed=useRef<HmgProject>();
  const saveKey = useRef<{ signature: string; key: string; version?:number }>();
  const chooseSave = (option:HmgOption) => {
    if (!authenticated) {login({redirect:true,callbackUrl:window.location.origin+`/studio/options/${encodeURIComponent(option.id)}`});return;}
    setSaving(option);
  };
  const toggle = (option: HmgOption) => {
    if (compare.some((o) => o.id === option.id))
      setCompare(compare.filter((o) => o.id !== option.id));
    else if (compare.length < 3) setCompare([...compare, option]);
    else setError("Compare up to 3 options. Remove one to add another.");
  };
  const save = async () => {
    if (savingLock.current) return;
    savingLock.current = true;
    const signature = `${projectId}:${saving?.id}`;
    if (saveKey.current?.signature !== signature)
      saveKey.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    failureCode.current=undefined;setConflictVersion(undefined);
    try {
      const p = await workflow<HmgProject>({
        command: "getProject",
        projectId,
      });
      if(saveKey.current.version===undefined)saveKey.current.version=p.version;
      await workflow({
        command: "addToShortlist",
        projectId,
        expectedVersion: saveKey.current.version,
        idempotencyKey: saveKey.current.key,
        payload: { optionId: saving?.id },
      });
      setSaving(null);
      saveKey.current = undefined;
      notify?.({type:"success",message:"Saved to shortlist",description:"Continue exploring; your project remains available from My projects."});
      void projects.refetch();
    } catch (e) {
      const failure=e as {code?:string;currentVersion?:number};failureCode.current=failure.code;
      if(failure.code==="CONFLICT")setConflictVersion(failure.currentVersion??saveKey.current?.version);
      setError(e instanceof Error ? e.message : "Not saved");
    } finally {
      savingLock.current = false;
      setBusy(false);
    }
  };
  return (
    <PageContainer>
      <PageHeading
        eyebrow="Selection Studio / 01"
        title="Find the direction for your space"
        description="A considered shortlist. A clearer conversation. A space that feels like yours."
        action={context?.canCreate ? <NextLink to="/projects/new">Start a project</NextLink> : undefined}
      />
      {optionId && detailQuery.loading && <LoadingState />}
      {optionId && detailQuery.error && (
        <LoadError retry={() => detailQuery.refetch()} />
      )}
      <Box sx={{ ...columnGrid, mb: 4 }}>
        <Panel>
          <Stack direction="row" justifyContent="space-between" mb={2}>
            <Chip label="THE MATERIAL EDIT" variant="outlined" />
            <Typography variant="body2" color="text.secondary">
              Gallery-led, evidence-aware
            </Typography>
          </Stack>
          <Typography variant="h2" sx={{ maxWidth: 620, my: 2 }}>
            Good spaces begin with
            <br />a thoughtful choice.
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 640, mb: 3 }}>
            Explore fictional design directions, record what matters and work
            with a consultant on the same evolving project.
          </Typography>
          <Alert severity="info">
            The direction cards use verified HMG gallery photographs for visual
            inspiration only. Their fictional copy is not product information;
            no stone identity, stock or material suitability is inferred from a
            photograph.
          </Alert>
        </Panel>
        <Panel title="Your next chapter">
          <Typography color="text.secondary" mb={3}>
            Start with one room. We will carry your brief, choices and questions
            through to your proposal.
          </Typography>
          {projects.data?.data[0] ? (
            <NextLink to={`/projects/${projects.data.data[0].id}`}>
              Continue {projects.data.data[0].name}
            </NextLink>
          ) : (
            context?.canCreate ? <NextLink to="/projects/new">Create a room brief</NextLink> : !authenticated ? <Button onClick={()=>login({redirect:true,callbackUrl:window.location.href})}>Sign in to create a project</Button> : <Typography>Open your assigned projects from the workspace.</Typography>
          )}
          <Typography variant="body2" color="text.secondary" mt={3}>
            01 Explore · 02 Compare · 03 Decide
          </Typography>
        </Panel>
      </Box>
      <Panel title="The HMG gallery">
        <Typography color="text.secondary" mb={2}>Explore the experience centre and factory. Every photograph is sourced from the approved HMG gallery and stored in the configured Taruvi S3 bucket.</Typography>
        <GalleryBrowser />
        <Button component={RouterLink} to="/studio-3d" variant="contained" sx={{mt:2}}>Design your space in 3D Stone Studio</Button>
      </Panel>
      <Typography variant="h2" sx={{mt:4,mb:2}}>Fictional design directions</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={2}>
        <TextField
          label="Search references"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          label="Visual tone"
          value={tone}
          onChange={(e) => update("tone", e.target.value)}
          sx={{ minWidth: 210 }}
        >
          <MenuItem value="">All tones</MenuItem>
          {["Warm", "Neutral", "Cool"].map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction="row" gap={1} mb={2}>
        {search && (
          <Chip
            label={`Search: ${search}`}
            onDelete={() => {
              setInput("");
              update("q", "");
            }}
          />
        )}
        {tone && (
          <Chip label={`Tone: ${tone}`} onDelete={() => update("tone", "")} />
        )}
      </Stack>
      {error && (
        <Alert severity="warning" onClose={() => setError("")} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {options.loading ? (
        <LoadingState />
      ) : options.error ? (
        <LoadError retry={() => options.refetch()} />
      ) : !options.data?.data.length ? (
        <EmptyState
          title={
            search
              ? "No results found"
              : tone
              ? "No matching items"
              : "No references yet"
          }
          description="Adjust your filters or return after the reference catalogue is available."
          action={
            <Button
              onClick={() => {
                setInput("");
                setParams({});
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              xl: "repeat(3, 1fr)",
            },
            gap: 3,
          }}
        >
          {options.data.data.map((option, index) => {
            const image = getDesignInspiration((page - 1) * pageSize + index);
            const imageFailed = !!image && failedDirectionImages.has(image.id);
            return (
            <Card key={option.id}>
              {image && !imageFailed ? (
                <Box
                  component="img"
                  src={image.src}
                  alt={image.alt}
                  loading="lazy"
                  decoding="async"
                  onError={() => setFailedDirectionImages((current) => new Set(current).add(image.id))}
                  sx={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
                />
              ) : (
                <ReferenceUnavailable />
              )}
              <CardContent>
                <Stack direction="row" gap={1} mb={2}>
                  <Chip label="Demo concept" size="small" />
                  <Chip label={option.tone} size="small" variant="outlined" />
                </Stack>
                {image && !imageFailed && (
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    Inspiration only · {image.title} · {image.category}
                  </Typography>
                )}
                <Button
                  onClick={() => setDetail(option)}
                  sx={{ p: 0, textAlign: "left" }}
                >
                  <Typography variant="h3">{option.title}</Typography>
                </Button>
                <Typography variant="body2" color="text.secondary" my={2}>
                  {option.movement} · Appearance direction only
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => chooseSave(option)}
                  >
                    Save to room
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<CompareArrowsRoundedIcon />}
                    onClick={() => toggle(option)}
                  >
                    {compare.some((o) => o.id === option.id)
                      ? "Remove"
                      : "Compare"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          );})}
        </Box>
      )}
      <TablePagination
        component="div"
        count={options.data?.total || 0}
        page={page - 1}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[10, 20, 50]}
        onPageChange={(_, p) => update("page", String(p + 1))}
        onRowsPerPageChange={(e) => update("size", e.target.value)}
      />
      {compare.length > 0 && (
        <Panel title={`Compare ${compare.length} directions`}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {compare.map((o) => (
              <Chip key={o.id} label={o.title} onDelete={() => toggle(o)} />
            ))}
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: `repeat(${compare.length}, 1fr)`,
              },
              gap: 3,
              mt: 3,
            }}
          >
            {compare.map((o) => (
              <Box key={o.id}>
                <Typography variant="h3">{o.title}</Typography>
                <Typography>
                  {o.tone} · {o.movement}
                </Typography>
                <Typography color="text.secondary" my={1}>
                  Application / care / quantity / exact slab / availability: Not
                  confirmed.
                </Typography>
                <Button onClick={() => chooseSave(o)}>
                  Save to shortlist
                </Button>
              </Box>
            ))}
          </Box>
        </Panel>
      )}
      <Dialog open={!!detail} onClose={closeDetail} maxWidth="md" fullWidth>
        <DialogTitle>{detail?.title}</DialogTitle>
        <DialogContent>
          {detail && (() => {
            const index = options.data?.data.findIndex((item) => item.id === detail.id) ?? -1;
            const image = index >= 0 ? getDesignInspiration((page - 1) * pageSize + index) : undefined;
            return image && !failedDirectionImages.has(image.id) ? (
              <Stack spacing={1}>
              <Box component="img" src={image.src} alt={image.alt} onError={() => setFailedDirectionImages((current) => new Set(current).add(image.id))} sx={{ display: "block", width: "100%", maxHeight: 420, objectFit: "cover" }} />
                <Typography variant="caption" color="text.secondary">Inspiration only · {image.title} · {image.category}</Typography>
              </Stack>
            ) : <ReferenceUnavailable compact />;
          })()}
          <Typography my={2}>
            Demo concept · Material identity not established.
          </Typography>
          <Typography color="text.secondary">
            Finish, thickness, technical application, exact slab and
            availability: Not confirmed. Exact-slab image unavailable in the
            approved gallery sources.
          </Typography>
          <Button
            component="a"
            href="https://www.hmgstones.com/gallery/"
            target="_blank"
            rel="noopener noreferrer"
          >
            View HMG gallery source
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>{if(detail)setEvidence(detail);}}>Evidence & unknowns</Button>
          <Button onClick={closeDetail}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (detail) chooseSave(detail);
              setDetail(null);
            }}
          >
            Save to room
          </Button>
        </DialogActions>
      </Dialog>
      <EvidenceDrawer open={!!evidence} option={evidence} onClose={()=>setEvidence(undefined)} />
      <Dialog
        open={!!saving}
        onClose={() => !busy && setSaving(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Save {saving?.title} to a room</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Search your projects" value={projectSearch} onChange={e=>{setProjectSearch(e.target.value);setProjectPage(1);setProjectId("");}} sx={{my:2}} />
          {projects.loading ? <LoadingState /> : projects.error ? <LoadError retry={projects.refetch} /> : projects.data?.data.length ? (
            <TextField
              fullWidth
              select
              label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              sx={{ mt: 2 }}
            >
              {projects.data.data.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} · {p.brief.room}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            context?.canCreate ? <NextLink to="/projects/new">Start a project first</NextLink> : <Typography>No assigned projects match. Ask your consultant for access.</Typography>
          )}
          <TablePagination component="div" count={projects.data?.total||0} page={projectPage-1} rowsPerPage={10} rowsPerPageOptions={[10]} onPageChange={(_,page)=>{setProjectPage(page+1);setProjectId("");}} />
          {error && <Alert severity="error">{error}</Alert>}
          <ConflictRecovery version={conflictVersion} refresh={async()=>{const current=await workflow<HmgProject>({command:'getProject',projectId});reviewed.current=current;return current;}} onRebase={version=>{
            if(savingLock.current||failureCode.current!=='CONFLICT'||reviewed.current?.version!==version||reviewed.current?.id!==projectId||!saveKey.current||saveKey.current.signature!==`${projectId}:${saving?.id}`||version<= (saveKey.current.version??0))throw new Error('Review a confirmed conflict before retrying.');
            saveKey.current={signature:`${projectId}:${saving?.id}`,key:crypto.randomUUID(),version};failureCode.current=undefined;setConflictVersion(undefined);setError('');
          }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaving(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!projectId || busy}
            onClick={save}
          >
            {busy ? "Saving..." : "Save to room"}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
