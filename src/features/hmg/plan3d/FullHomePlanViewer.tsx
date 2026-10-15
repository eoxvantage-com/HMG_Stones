import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, ButtonBase, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { taruviTokens } from "../../../../themeOptions";
import type { FullHomeLayout, FullHomeLayoutRoom } from "./fullHomeLayout";
import type { HmgPlanOpening } from "../types";
import { createHomeTextures, type HomeAssignment, type HomeTextureTarget } from './homeTextures';

const FT_TO_M = 0.3048;

function ftToM(value: number) {
  return value * FT_TO_M;
}
export type RenderableRoomPart = "floor" | "walls";

export function renderableRoomParts(layout: FullHomeLayout) {
  return {
    rooms: layout.rooms.map((room) => ({
      id: room.id,
      parts: [
        ...(room.includeFloor ? ["floor" as const] : []),
        ...(room.includeInteriorWalls ? ["walls" as const] : []),
      ] as RenderableRoomPart[],
    })),
  };
}

function categoryColor(category: FullHomeLayoutRoom["category"]) {
  switch (category) {
    case "hall": return taruviTokens.hmg.soft;
    case "kitchen": return taruviTokens.neutral[200];
    case "bedroom": return taruviTokens.hmg.background;
    case "toilet": return taruviTokens.neutral[300];
    case "sit_out": return taruviTokens.hmg.border;
    case "pooja": return taruviTokens.hmg.bronze;
    case "stair": return taruviTokens.neutral[400];
    default: return taruviTokens.neutral[200];
  }
}

export type HomeSurface = 'floor'|'north'|'east'|'south'|'west';
export function pickHomeSurface(targets:THREE.Mesh[], camera:THREE.Camera, point:THREE.Vector2) {
  const raycaster=new THREE.Raycaster();
  raycaster.setFromCamera(point,camera);
  return raycaster.intersectObjects(targets,false)[0]?.object.userData.homeSurface as {roomId:string;surface:HomeSurface} | undefined;
}
export function FullHomePlanViewer({ layout, assignments = {}, openings = [], renderCanvas = true, onEditRoom, activeRoomId }: { layout: FullHomeLayout; assignments?: Record<string, HomeAssignment>; openings?: HmgPlanOpening[]; renderCanvas?: boolean; onEditRoom?:(roomId:string, surface?:HomeSurface)=>void; activeRoomId?:string }) {
  const host = useRef<HTMLDivElement>(null);
  const selectRoom = useRef(onEditRoom);
  selectRoom.current = onEditRoom;
  const textures = useRef<ReturnType<typeof createHomeTextures> | null>(null);
  const latestAssignments = useRef(assignments);
  latestAssignments.current = assignments;
  const [textureStatus, setTextureStatus] = useState({pending:0, failed:0});
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const hasRooms = layout.rooms.length > 0;
  const renderParts = renderableRoomParts(layout);
  const features = layout.features || [];
  const planFeatures = layout.planFeatures || [];
  const coverageStats = layout.builtUpAreaSqFt ? [
    { label: "Built-up area", value: `${layout.builtUpAreaSqFt.toFixed(1)} sq ft` },
    { label: "Modeled rooms", value: `${layout.totalAreaSqFt.toFixed(1)} sq ft` },
    { label: "Unmodeled / circulation", value: `${(layout.unmodeledAreaSqFt || 0).toFixed(1)} sq ft` },
  ] : [];

  useEffect(() => {
    const container = host.current;
    if (!container || !hasRooms || !renderCanvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    setWebglUnavailable(false);
    setTextureStatus({pending:0, failed:0});
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(taruviTokens.hmg.background);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Interactive schematic whole-home 3D preview. Drag to orbit, scroll to zoom.");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(canvas);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.minDistance = 1;
    controls.maxDistance = 120;
    controls.maxPolarAngle = Math.PI * 0.49;

    const disposables: Array<{ dispose: () => void }> = [];
    const textureTargets: HomeTextureTarget[] = [];
    const pickTargets: THREE.Mesh[] = [];
    const selectable = (mesh:THREE.Mesh, roomId:string, surface:HomeSurface) => {
      mesh.userData.homeSurface={roomId,surface};
      pickTargets.push(mesh);
      return mesh;
    };
    const meshes: THREE.Object3D[] = [];
    const material = (color: string, options: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, ...options });
      disposables.push(mat);
      return mat;
    };
    const addMesh = (mesh: THREE.Mesh) => {
      meshes.push(mesh);
      scene.add(mesh);
      return mesh;
    };
    const addBox = (size: [number, number, number], position: [number, number, number], color: string, options: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const geometry = new THREE.BoxGeometry(...size);
      disposables.push(geometry);
      addMesh(new THREE.Mesh(geometry, material(color, options))).position.set(...position);
    };
    const addRoomObjects = (room: FullHomeLayoutRoom, centerX: number, centerZ: number, length: number, width: number) => {
      const floorY = 0.12;
      const wood = taruviTokens.hmg.bronze;
      const fabric = taruviTokens.neutral[500];
      const brass = taruviTokens.status.review;
      const clampX = (ratio: number, half: number) => centerX - length / 2 + Math.min(Math.max(length * ratio, half + 0.08), length - half - 0.08);
      const clampZ = (ratio: number, half: number) => centerZ - width / 2 + Math.min(Math.max(width * ratio, half + 0.08), width - half - 0.08);
      const furniture = (w: number, h: number, d: number, rx: number, rz: number, color: string = wood) => {
        if (w + 0.16 > length || d + 0.16 > width) return;
        addBox([w, h, d], [clampX(rx, w / 2), floorY + h / 2, clampZ(rz, d / 2)], color);
      };
      const lamp = (rx: number, rz: number) => {
        if (0.2 > length || 0.2 > width) return;
        const x = clampX(rx, 0.1), z = clampZ(rz, 0.1);
        addBox([0.06, 0.75, 0.06], [x, floorY + 0.38, z], brass, { emissive: brass, emissiveIntensity: 0.18 });
        const geometry = new THREE.SphereGeometry(0.16, 12, 8);
        disposables.push(geometry);
        addMesh(new THREE.Mesh(geometry, material(taruviTokens.surface.paper, { emissive: taruviTokens.surface.paper, emissiveIntensity: 0.45 }))).position.set(x, floorY + 0.82, z);
        const point = new THREE.PointLight(taruviTokens.surface.paper, 0.35, 3);
        point.position.set(x, floorY + 1.1, z);
        meshes.push(point);
        scene.add(point);
      };
      switch (room.category) {
        case "hall":
          furniture(Math.min(2.0, length * 0.45), 0.45, Math.min(0.75, width * 0.22), 0.5, 0.22, fabric);
          furniture(Math.min(1.05, length * 0.28), 0.25, Math.min(0.55, width * 0.18), 0.5, 0.52, wood);
          lamp(0.82, 0.22);
          break;
        case "kitchen":
          furniture(Math.min(1.8, length * 0.5), 0.28, Math.min(0.85, width * 0.3), 0.5, 0.5, wood);
          furniture(0.42, 0.42, 0.42, 0.32, 0.5, fabric);
          furniture(0.42, 0.42, 0.42, 0.68, 0.5, fabric);
          lamp(0.5, 0.25);
          break;
        case "bedroom":
          furniture(Math.min(1.55, length * 0.48), 0.35, Math.min(1.9, width * 0.52), 0.5, 0.43, taruviTokens.neutral[100]);
          furniture(Math.min(1.3, length * 0.38), 1.15, Math.min(0.45, width * 0.16), 0.22, 0.82, wood);
          lamp(0.30, 0.36);
          break;
        case "toilet":
          furniture(Math.min(0.55, length * 0.35), 0.32, Math.min(0.45, width * 0.35), 0.5, 0.55, taruviTokens.neutral[100]);
          break;
        default:
          furniture(Math.min(0.8, length * 0.35), 0.25, Math.min(0.5, width * 0.25), 0.5, 0.5, wood);
          lamp(0.75, 0.3);
      }
    };

    const boundsLength = Math.max(ftToM(layout.bounds.lengthFt), 1);
    const boundsWidth = Math.max(ftToM(layout.bounds.widthFt), 1);
    const originX = -boundsLength / 2;
    const originZ = -boundsWidth / 2;

    const baseGeometry = new THREE.BoxGeometry(boundsLength + 0.25, 0.06, boundsWidth + 0.25);
    disposables.push(baseGeometry);
    addMesh(new THREE.Mesh(baseGeometry, material(taruviTokens.neutral[200]))).position.set(0, -0.05, 0);
    const footprintEdgesGeometry = new THREE.EdgesGeometry(baseGeometry);
    disposables.push(footprintEdgesGeometry);
    const footprintEdges = new THREE.LineSegments(footprintEdgesGeometry, new THREE.LineBasicMaterial({ color: taruviTokens.status.review }));
    disposables.push(footprintEdges.material as THREE.Material);
    footprintEdges.position.set(0, 0.02, 0);
    meshes.push(footprintEdges);
    scene.add(footprintEdges);

    layout.rooms.forEach((room) => {
      const length = ftToM(room.lengthFt);
      const width = ftToM(room.widthFt);
      const height = ftToM(room.heightFt);
      const centerX = originX + ftToM(room.xFt) + length / 2;
      const centerZ = originZ + ftToM(room.zFt) + width / 2;
      const parts = renderParts.rooms.find((item) => item.id === room.id)?.parts || [];
      if (parts.includes("floor")) {
        const floorGeometry = new THREE.BoxGeometry(length, 0.08, width);
        disposables.push(floorGeometry);
        const floorMaterial = material(categoryColor(room.category));
        textureTargets.push({key:`${room.id}:floor`, material:floorMaterial});
        selectable(addMesh(new THREE.Mesh(floorGeometry, floorMaterial)), room.id, 'floor').position.set(centerX, 0, centerZ);
        const edgeGeometry = new THREE.EdgesGeometry(floorGeometry);
        disposables.push(edgeGeometry);
        const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: taruviTokens.neutral[700] }));
        disposables.push(edges.material as THREE.Material);
        edges.position.set(centerX, 0.05, centerZ);
        meshes.push(edges);
        scene.add(edges);
      }

      if (parts.includes("walls")) {
        const wallThickness = 0.08;
        const wallHeight = Math.max(height, 1.8);
        const wallGeometries = [
          { direction:'north', size: [length, wallHeight, wallThickness] as const, position: [centerX, wallHeight / 2, centerZ - width / 2] as const },
          { direction:'west', size: [wallThickness, wallHeight, width] as const, position: [centerX - length / 2, wallHeight / 2, centerZ] as const },
          { direction:'east', size: [wallThickness, wallHeight, width] as const, position: [centerX + length / 2, wallHeight / 2, centerZ] as const },
          { direction:'south', size: [length, wallHeight, wallThickness] as const, position: [centerX, wallHeight / 2, centerZ + width / 2] as const },
        ];
        wallGeometries.forEach((wall) => {
          const wallMaterial = material(taruviTokens.neutral[300], { transparent:true, opacity:wall.direction === 'south' ? 0.12 : 0.68 });
          textureTargets.push({key:`${room.id}:${wall.direction}`,fallbackKey:`${room.id}:walls`,material:wallMaterial});
          const geometry = new THREE.BoxGeometry(...wall.size);
          disposables.push(geometry);
          selectable(addMesh(new THREE.Mesh(geometry, wallMaterial)), room.id, wall.direction as HomeSurface).position.set(...wall.position);
        });
      }
      addRoomObjects(room, centerX, centerZ, length, width);
    });

    planFeatures.forEach((feature) => {
      const length = ftToM(feature.lengthFt);
      const width = ftToM(feature.widthFt);
      const centerX = originX + ftToM(feature.xFt) + length / 2;
      const centerZ = originZ + ftToM(feature.zFt) + width / 2;
      const featureHeight = feature.type === "stair" ? 0.35 : 0.14;
      const featureGeometry = new THREE.BoxGeometry(length, featureHeight, width);
      disposables.push(featureGeometry);
      const featureColor = feature.type === "stair" ? taruviTokens.neutral[500] : taruviTokens.status.review;
      addMesh(new THREE.Mesh(featureGeometry, material(featureColor, { transparent: true, opacity: 0.76 }))).position.set(centerX, featureHeight / 2, centerZ);
      const edgeGeometry = new THREE.EdgesGeometry(featureGeometry);
      disposables.push(edgeGeometry);
      const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: taruviTokens.neutral[700] }));
      disposables.push(edges.material as THREE.Material);
      edges.position.set(centerX, featureHeight + 0.03, centerZ);
      meshes.push(edges);
      scene.add(edges);
    });

    scene.add(new THREE.HemisphereLight(taruviTokens.surface.paper, taruviTokens.neutral[600], 2));
    const light = new THREE.DirectionalLight(taruviTokens.surface.paper, 1.8);
    light.position.set(4, 10, 8);
    scene.add(light);

    const maxBound = Math.max(boundsLength, boundsWidth);
    camera.position.set(maxBound * 0.75, Math.max(7, maxBound * 0.65), maxBound * 1.05);
    controls.target.set(0, 0, 0);
    controls.update();

    let failed = false;
    const render = () => {
      if (failed) return;
      try { renderer.render(scene, camera); }
      catch { failed = true; setWebglUnavailable(true); }
    };
    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    controls.addEventListener("change", render);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    let down: {x:number;y:number} | null = null;
    const pointerDown = (event:PointerEvent) => {down=event.button===0 ? {x:event.clientX,y:event.clientY} : null;};
    const pointerUp = (event:PointerEvent) => {
      const start=down; down=null;
      if (!start || Math.hypot(event.clientX-start.x,event.clientY-start.y)>5) return;
      const rect=canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const hit=pickHomeSurface(pickTargets,camera,new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2));
      if (hit) selectRoom.current?.(hit.roomId,hit.surface);
    };
    const cancelPointer = () => {down=null;};
    canvas.addEventListener('pointerdown',pointerDown);
    canvas.addEventListener('pointerup',pointerUp);
    canvas.addEventListener('pointercancel',cancelPointer);
    const textureController = createHomeTextures(textureTargets, render, (pending, failed) => setTextureStatus({pending, failed}));
    textures.current = textureController;
    void textureController.update(latestAssignments.current);

    return () => {
      canvas.removeEventListener('pointerdown',pointerDown);
      canvas.removeEventListener('pointerup',pointerUp);
      canvas.removeEventListener('pointercancel',cancelPointer);
      textureController.dispose();
      textures.current = null;
      observer.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      meshes.forEach((mesh) => scene.remove(mesh));
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, [hasRooms, layout, renderCanvas]);

  useEffect(() => {void textures.current?.update(assignments);}, [assignments]);

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2, bgcolor: "background.paper" }}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
          <Box>
            <Typography variant="h3">Whole-home 3D preview</Typography>
            <Typography variant="body2" color="text.secondary">
              {hasRooms ? `${layout.rooms.length} reviewed rooms · ${layout.totalAreaSqFt.toFixed(1)} sq ft modeled` : "No reviewed rooms available for whole-home 3D preview."}
            </Typography>
          </Box>
          <Chip variant="outlined" color="warning" label="Schematic, not measured" />
        </Stack>
        {onEditRoom && <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}>
          <TextField select label="Room to design" value={activeRoomId || ''} onChange={event=>onEditRoom(event.target.value,'floor')} sx={{minWidth:220}}>
            <MenuItem value="" disabled>Select a room</MenuItem>
            {layout.rooms.map(room=><MenuItem key={room.id} value={room.id}>{room.name}</MenuItem>)}
          </TextField>
          <Typography variant="body2">Click a floor or wall in the model, or choose a room here. Then select a stone on the right.</Typography>
        </Stack>}
        {coverageStats.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1 }}>
            {coverageStats.map((stat) => (
              <Box key={stat.label} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, bgcolor: "background.default" }}>
                <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                <Typography fontWeight={700}>{stat.value}</Typography>
              </Box>
            ))}
          </Box>
        )}
        {features.length > 0 && (
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            {features.map((feature) => <Chip key={feature} variant="outlined" color="info" label={feature} />)}
          </Stack>
        )}
        {layout.warnings.map((warning) => <Alert key={warning} severity="warning">{warning}</Alert>)}
        {textureStatus.pending > 0 && <Typography role="status">Loading stone images ({textureStatus.pending})…</Typography>}
        {textureStatus.failed > 0 && <Alert severity="warning">{textureStatus.failed} stone images could not be loaded. Assignments are retained; affected surfaces remain neutral. Reopen Whole home to retry.</Alert>}
        <Typography variant="body2" color="text.secondary">Whole-home textures fit each surface. Use 3D View for detailed tile, slab and grout layout. Save the current room before editing another room.</Typography>
        {hasRooms ? (
          <>
            <Box ref={host} sx={{ height: { xs: 300, md: 440 }, display: webglUnavailable ? "none" : "block", bgcolor: taruviTokens.hmg.background, borderRadius: 1, overflow: "hidden", "& canvas:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: -3 } }} />
            {webglUnavailable && <Box role="img" aria-label="Schematic whole-home 3D preview unavailable" sx={{ minHeight: 220, display: "grid", placeItems: "center", bgcolor: taruviTokens.hmg.background, borderRadius: 1, p: 3, textAlign: "center" }}>
              <Typography>3D preview is unavailable on this device. The reviewed room list below is retained.</Typography>
            </Box>}
            {planFeatures.length > 0 && (
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                <Typography fontWeight={700}>Plan features in preview</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Stairs, ducts, roads and setbacks are rendered as planning evidence when coordinates are extracted.
                </Typography>
                <Stack direction="row" gap={0.75} flexWrap="wrap">
                  {planFeatures.map((feature, index) => <Chip key={`${feature.id || feature.label}-${index}`} variant="outlined" label={`${feature.label} ? ${feature.type}`} />)}
                </Stack>
              </Box>
            )}
            {openings.length > 0 && (
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                <Typography fontWeight={700}>Extracted openings for review</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Doors, windows and ventilators are AI evidence only and are not deducted from stone quantities.
                </Typography>
                <Stack direction="row" gap={0.75} flexWrap="wrap">
                  {openings.map((opening, index) => (
                    <Chip
                      key={`${opening.id || opening.label}-${index}`}
                      variant="outlined"
                      label={`${opening.label} · ${opening.type}${opening.notes ? ` · ${opening.notes}` : ""}`}
                    />
                  ))}
                </Stack>
              </Box>
            )}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1 }}>
              {layout.rooms.map((room) => (
                <Box key={room.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
                  <ButtonBase
                    disabled={!onEditRoom || !room.includeFloor}
                    aria-label={`Select ${room.name} floor`}
                    onClick={()=>onEditRoom?.(room.id,'floor')}
                    sx={{display:'block',width:'100%',textAlign:'left',minHeight:44,borderRadius:1,'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'primary.main'},'&:hover':{bgcolor:'action.hover'}}}
                  >
                    <Typography fontWeight={700}>{room.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{room.lengthFt} × {room.widthFt} ft · {room.areaSqFt.toFixed(1)} sq ft</Typography>
                  </ButtonBase>
                  <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                    {room.includeFloor && <Chip size="small" variant="outlined" onClick={onEditRoom ? ()=>onEditRoom(room.id,'floor') : undefined} color={assignments[`${room.id}:floor`] ? "success" : "default"} label={assignments[`${room.id}:floor`] ? "Floor assigned" : "Floor unassigned"} />}
                    {room.includeInteriorWalls && <Chip size="small" variant="outlined" color={['walls','north','east','south','west'].some(side=>assignments[`${room.id}:${side}`]) ? "success" : "default"} label={['walls','north','east','south','west'].some(side=>assignments[`${room.id}:${side}`]) ? "Wall stone assigned" : "Walls unassigned"} />}
                  </Stack>
                  {onEditRoom && <Button onClick={()=>onEditRoom(room.id,'floor')}>{activeRoomId===room.id ? 'Select this floor' : `Edit ${room.name}`}</Button>}
                </Box>
              ))}
            </Box>
          </>
        ) : (
          <Box role="img" aria-label="Schematic whole-home 3D preview unavailable" sx={{ minHeight: 180, display: "grid", placeItems: "center", bgcolor: taruviTokens.hmg.background, borderRadius: 1, p: 3, textAlign: "center" }}>
            <Typography>No reviewed rooms available for whole-home 3D preview.</Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
}




