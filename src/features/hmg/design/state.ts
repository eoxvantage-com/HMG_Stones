export type Vector = [number, number, number];
export type CameraState = { position: Vector; target: Vector };
export type RoomDimensions = { width: number; height: number; depth: number };
export type Annotation = { id: string; x: number; y: number; text: string };
export type DesignState = {
  version: 1;
  mode: 'reference_2d' | 'geometry_3d';
  visualizationStatus: 'not_started' | 'ready' | 'incomplete';
  surface: 'wall' | 'floor';
  room: RoomDimensions;
  camera: CameraState;
  title: string;
  note: string;
  reference: { assetId: string; zoom: number; pan: [number, number]; annotations: Annotation[] };
};
/** Match OrbitControls limits and bound panning so state always remains serializable. */
export function constrainCamera(camera: CameraState): CameraState {
  const target = camera.target.map(v => Math.max(-60, Math.min(60, v))) as Vector;
  const offset = camera.position.map((v, i) => v - camera.target[i]);
  const distance = Math.hypot(...offset);
  const phi = Math.acos(Math.max(-1, Math.min(1, offset[1] / (distance || 1))));
  if (distance >= .5 - 1e-9 && distance <= 40 + 1e-9 && phi >= .1 - 1e-9 && phi <= Math.PI * .49 + 1e-9 && target.every((v, i) => v === camera.target[i]))
    return { position: [...camera.position], target };
  const radius = Math.max(.5, Math.min(40, distance));
  const polar = Math.max(.1, Math.min(Math.PI * .49, phi));
  const theta = Math.atan2(offset[0], offset[2]);
  return { target, position: [target[0] + radius * Math.sin(polar) * Math.sin(theta), target[1] + radius * Math.cos(polar), target[2] + radius * Math.sin(polar) * Math.cos(theta)] };
}
export function cameraPreset(view: 'front' | 'corner' | 'detail', room: RoomDimensions): CameraState {
  const target: Vector = [0, room.height * .43, -room.depth * .12];
  const span = Math.max(room.width, room.depth, room.height);
  // Presets must already obey the renderer/parser limits so saving then loading
  // does not silently move the camera (front views can exceed the polar cap).
  return constrainCamera({ target, position: view === 'front' ? [0, room.height * .5, span * 1.45]
    : view === 'detail' ? [room.width * .18, room.height * .52, room.depth * .16]
      : [span * 1.15, room.height * 1.35, span * 1.4] });
}
export function createDefaultDesignState(): DesignState {
  const room = { width: 5, height: 3, depth: 4 };
  return { version: 1, mode: 'reference_2d', visualizationStatus: 'not_started', surface: 'wall', room, camera: cameraPreset('corner', room), title: 'Room composition', note: '',
    reference: { assetId: '', zoom: 1, pan: [0, 0], annotations: [] } };
}
const numberIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const stringIn = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const vector = (v: unknown): v is Vector => Array.isArray(v) && v.length === 3 && v.every(x => numberIn(x, -100, 100));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Parse only the geometry/reference schema; never accepts image URLs, textures or executable settings. */
export function parseDesignState(input: unknown): DesignState | null {
  if (!object(input) || input.version !== 1 || !['wall', 'floor'].includes(String(input.surface))) return null;
  const mode = input.mode ?? 'reference_2d';
  const visualizationStatus = input.visualizationStatus ?? 'not_started';
  if (mode !== 'reference_2d' && mode !== 'geometry_3d') return null;
  if (visualizationStatus !== 'not_started' && visualizationStatus !== 'ready' && visualizationStatus !== 'incomplete') return null;
  const { room, camera, reference } = input;
  if (!object(room) || !numberIn(room.width, 2, 12) || !numberIn(room.height, 2, 6) || !numberIn(room.depth, 2, 12)) return null;
  if (!object(camera) || !vector(camera.position) || !vector(camera.target)) return null;
  if (Math.hypot(...camera.position.map((p, i) => p - (camera.target as Vector)[i])) < .1) return null;
  if (!stringIn(input.title, 120) || !stringIn(input.note, 500)) return null;
  if (!object(reference) || !stringIn(reference.assetId, 120) || !numberIn(reference.zoom, 1, 4)
    || !Array.isArray(reference.pan) || reference.pan.length !== 2 || !reference.pan.every(v => numberIn(v, -1000, 1000))
    || !Array.isArray(reference.annotations) || reference.annotations.length > 30) return null;
  const annotations: Annotation[] = [];
  for (const a of reference.annotations) {
    if (!object(a) || !stringIn(a.id, 100) || !numberIn(a.x, 0, 1) || !numberIn(a.y, 0, 1) || !stringIn(a.text, 500) || !a.text.trim()) return null;
    annotations.push({ id: a.id, x: a.x, y: a.y, text: a.text });
  }
  if (new Set(annotations.map(a => a.id)).size !== annotations.length) return null;
  return { version: 1, mode, visualizationStatus, surface: input.surface as DesignState['surface'], title: input.title, note: input.note,
    room: { width: room.width, height: room.height, depth: room.depth },
    camera: constrainCamera({ position: [...camera.position], target: [...camera.target] }),
    reference: { assetId: reference.assetId, zoom: reference.zoom, pan: [...reference.pan] as [number, number], annotations } };
}
