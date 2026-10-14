import { useEffect, useRef, useState } from "react";
import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { taruviTokens } from "../../../../themeOptions";
import type { FullHomeLayout, FullHomeLayoutRoom } from "./fullHomeLayout";
import type { HmgPlanOpening } from "../types";

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

export function FullHomePlanViewer({ layout, assignments = {}, openings = [], renderCanvas = true }: { layout: FullHomeLayout; assignments?: Record<string, { assetId: string }>; openings?: HmgPlanOpening[]; renderCanvas?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const hasRooms = layout.rooms.length > 0;
  const renderParts = renderableRoomParts(layout);

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

    const boundsLength = Math.max(ftToM(layout.bounds.lengthFt), 1);
    const boundsWidth = Math.max(ftToM(layout.bounds.widthFt), 1);
    const originX = -boundsLength / 2;
    const originZ = -boundsWidth / 2;

    const baseGeometry = new THREE.BoxGeometry(boundsLength + 0.25, 0.06, boundsWidth + 0.25);
    disposables.push(baseGeometry);
    addMesh(new THREE.Mesh(baseGeometry, material(taruviTokens.neutral[200]))).position.set(0, -0.05, 0);

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
        addMesh(new THREE.Mesh(floorGeometry, material(categoryColor(room.category)))).position.set(centerX, 0, centerZ);
        const edgeGeometry = new THREE.EdgesGeometry(floorGeometry);
        disposables.push(edgeGeometry);
        const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: taruviTokens.neutral[700] }));
        disposables.push(edges.material as THREE.Material);
        edges.position.set(centerX, 0.05, centerZ);
        meshes.push(edges);
        scene.add(edges);
      }

      if (parts.includes("walls")) {
        const wallMaterial = material(taruviTokens.neutral[300], { transparent: true, opacity: 0.68 });
        const wallThickness = 0.08;
        const wallHeight = Math.max(height, 1.8);
        const wallGeometries = [
          { size: [length, wallHeight, wallThickness] as const, position: [centerX, wallHeight / 2, centerZ - width / 2] as const },
          { size: [wallThickness, wallHeight, width] as const, position: [centerX - length / 2, wallHeight / 2, centerZ] as const },
          { size: [wallThickness, wallHeight, width] as const, position: [centerX + length / 2, wallHeight / 2, centerZ] as const },
        ];
        wallGeometries.forEach((wall) => {
          const geometry = new THREE.BoxGeometry(...wall.size);
          disposables.push(geometry);
          addMesh(new THREE.Mesh(geometry, wallMaterial)).position.set(...wall.position);
        });
      }
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

    return () => {
      observer.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      meshes.forEach((mesh) => scene.remove(mesh));
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, [hasRooms, layout, renderCanvas]);

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
        {layout.warnings.map((warning) => <Alert key={warning} severity="warning">{warning}</Alert>)}
        {hasRooms ? (
          <>
            <Box ref={host} sx={{ height: { xs: 300, md: 440 }, display: webglUnavailable ? "none" : "block", bgcolor: taruviTokens.hmg.background, borderRadius: 1, overflow: "hidden", "& canvas:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: -3 } }} />
            {webglUnavailable && <Box role="img" aria-label="Schematic whole-home 3D preview unavailable" sx={{ minHeight: 220, display: "grid", placeItems: "center", bgcolor: taruviTokens.hmg.background, borderRadius: 1, p: 3, textAlign: "center" }}>
              <Typography>3D preview is unavailable on this device. The reviewed room list below is retained.</Typography>
            </Box>}
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
                  <Typography fontWeight={700}>{room.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{room.lengthFt} × {room.widthFt} ft · {room.areaSqFt.toFixed(1)} sq ft</Typography>
                  <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                    {room.includeFloor && <Chip size="small" variant="outlined" color={assignments[`${room.id}:floor`] ? "success" : "default"} label={assignments[`${room.id}:floor`] ? "Floor assigned" : "Floor unassigned"} />}
                    {room.includeInteriorWalls && <Chip size="small" variant="outlined" color={assignments[`${room.id}:walls`] ? "success" : "default"} label={assignments[`${room.id}:walls`] ? "Walls assigned" : "Walls unassigned"} />}
                  </Stack>
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




