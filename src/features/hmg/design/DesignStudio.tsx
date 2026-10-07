import { Component, lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Chip, MenuItem, Skeleton, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import { cameraPreset, constrainCamera, type DesignState } from './state';
import { ReferenceCanvas } from './ReferenceCanvas';
import { approvedGalleryReferences } from './galleryReferences';

const RoomScene = lazy(() => import('./RoomScene'));
class RendererBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <Alert severity="warning">Interactive 3D could not load. Reference notes and project workflows remain available.</Alert> : this.props.children; }
}
export type DesignStudioProps = { resetKey: string; value: DesignState; onChange: (state: DesignState) => void };
/** Controlled editor: the host owns authoritative persistence and save/conflict notifications. */
export function DesignStudio(props: DesignStudioProps) {
  return <DesignEditor key={props.resetKey} {...props} />;
}
function DesignEditor({ value, onChange }: DesignStudioProps) {
  const tab = value.mode === 'geometry_3d' ? 1 : 0;
  const [entered, setEntered] = useState(false);
  const history = useRef<DesignState[]>([]); const future = useRef<DesignState[]>([]);
  const latest = useRef(value); latest.current = value;
  const viewAvailable = tab === 1 ? entered : approvedGalleryReferences.some(item => item.id === value.reference.assetId);
  const outcome = (visualizationStatus: DesignState['visualizationStatus']) => {
    if (latest.current.visualizationStatus !== visualizationStatus) {
      const next = { ...latest.current, visualizationStatus }; latest.current = next; onChange(next);
    }
  };
  const update = (next: DesignState) => {
    next = { ...next, camera: constrainCamera(next.camera) };
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return;
    history.current = [...history.current.slice(-39), latest.current]; future.current = []; latest.current = next; onChange(next);
  };
  const zoom = (factor: number) => {
    if (tab === 0) update({ ...value, reference: { ...value.reference, zoom: Math.max(1, Math.min(4, value.reference.zoom * factor)) } });
    else {
      const offset = value.camera.position.map((p, i) => p - value.camera.target[i]);
      const distance = Math.hypot(...offset); const nextDistance = Math.max(.5, Math.min(40, distance / factor));
      update({ ...value, camera: { ...value.camera, position: offset.map((p, i) => value.camera.target[i] + p / distance * nextDistance) as [number, number, number] } });
    }
  };
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 280px' }, gap: 3, fontFamily: 'system-ui, sans-serif' }}>
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Tabs value={tab} onChange={(_, next: number) => update({ ...value, mode: next === 1 ? 'geometry_3d' : 'reference_2d', visualizationStatus: 'not_started' })} aria-label="Design mode"><Tab label="2D reference" /><Tab label="3D room" /></Tabs>
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} aria-label="Canvas controls">
        <Button disabled={!viewAvailable} onClick={() => zoom(1.2)} aria-label="Zoom in">Zoom +</Button><Button disabled={!viewAvailable} onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">Zoom −</Button>
        <Button disabled={!viewAvailable} startIcon={<RestartAltRoundedIcon />} onClick={() => update(tab === 0 ? { ...value, reference: { ...value.reference, zoom: 1, pan: [0, 0] } } : { ...value, camera: cameraPreset('corner', value.room) })}>Reset view</Button>
        <Button aria-label="Undo design change" startIcon={<UndoRoundedIcon />} disabled={!history.current.length} onClick={() => { const previous = history.current.pop(); if (previous) { future.current.push(value); onChange(previous); } }}>Undo</Button>
        <Button aria-label="Redo design change" startIcon={<RedoRoundedIcon />} disabled={!future.current.length} onClick={() => { const next = future.current.pop(); if (next) { history.current.push(value); onChange(next); } }}>Redo</Button>
      </Stack>
      {tab === 0 ? <ReferenceCanvas key={value.reference.assetId} value={value} onChange={update} /> : !entered ? <Box sx={{ minHeight: 320, display: 'grid', placeContent: 'center', gap: 2, p: 3, bgcolor: 'action.hover' }}>
        <Typography variant="h5">Explore the composition</Typography><Typography>Real interactive geometry. No simulated stone finish.</Typography>
        <Button variant="contained" onClick={() => setEntered(true)}>Enter 3D room</Button>
      </Box> : <RendererBoundary onFailure={() => outcome('incomplete')}><Suspense fallback={<Skeleton variant="rectangular" height={400} aria-label="Loading interactive room" />}><RoomScene value={value} onStatusChange={outcome} onCameraChange={camera => update({ ...latest.current, camera })} /></Suspense></RendererBoundary>}
      <Alert severity="info">Stone overlay unavailable: an eligible material image and surface mask are required. Material appearance is not rendered.</Alert>
    </Stack>
    <Stack spacing={2}>
      <Chip label="Conceptual · Not measured" variant="outlined" />
      <Typography variant="h5">Composition controls</Typography>
      <Typography variant="body2" color="text.secondary">Fixed neutral colors and lighting. Dimensions are planning values, not measured room or stone quantities.</Typography>
      <ToggleButtonGroup exclusive value={value.surface} onChange={(_, surface: DesignState['surface'] | null) => { if (surface) update({ ...value, surface }); }} aria-label="Selected surface" fullWidth>
        <ToggleButton value="wall" sx={{ minHeight: 44 }}>Feature wall</ToggleButton><ToggleButton value="floor" sx={{ minHeight: 44 }}>Floor</ToggleButton>
      </ToggleButtonGroup>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {(['front', 'corner', 'detail'] as const).map(view => <Button key={view} variant="outlined" onClick={() => { setEntered(true); update({ ...value, mode: 'geometry_3d', camera: cameraPreset(view, value.room) }); }}>{view}</Button>)}
      </Stack>
      {(['width', 'height', 'depth'] as const).map(axis => <TextField key={axis} label={`Conceptual ${axis} (m)`} type="number" value={value.room[axis]} inputProps={{ min: 2, max: axis === 'height' ? 6 : 12, step: .1 }} onChange={event => {
        const dimension = Number(event.target.value); if (!Number.isFinite(dimension) || dimension < 2 || dimension > (axis === 'height' ? 6 : 12)) return;
        update({ ...value, room: { ...value.room, [axis]: dimension } });
      }} />)}
      {approvedGalleryReferences.length > 0 && <TextField select label="Gallery reference" value={value.reference.assetId} onChange={event => update({ ...value, reference: { assetId: event.target.value, pan: [0, 0], zoom: 1, annotations: [] } })}><MenuItem value="">None selected</MenuItem>{approvedGalleryReferences.map(item => <MenuItem key={item.id} value={item.id}>{item.title}</MenuItem>)}</TextField>}
      <TextField label="Concept title" value={value.title} onChange={event => update({ ...value, title: event.target.value })} inputProps={{ maxLength: 120 }} />
      <TextField label="Concept notes" multiline minRows={3} value={value.note} onChange={event => update({ ...value, note: event.target.value })} inputProps={{ maxLength: 500 }} helperText={`${value.note.length}/500 · Saved with your concept`} />
      <Typography variant="caption">3D: drag to orbit; right-drag or two fingers to pan; wheel/pinch to zoom. Keyboard: arrows orbit, Shift + arrows pan, +/− zoom.</Typography>
      <Typography variant="caption">Eligible surface material asset: None. A linked shortlist choice is a planning reference, not rendered stone.</Typography>
    </Stack>
  </Box>;
}
