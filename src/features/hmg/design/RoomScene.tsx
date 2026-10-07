import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { taruviTokens } from '../../../../themeOptions';
import { constrainCamera, type CameraState, type DesignState, type Vector } from './state';

export default function RoomScene({ value, onCameraChange, onStatusChange }: { value: DesignState; onStatusChange: (status: DesignState['visualizationStatus']) => void; onCameraChange: (camera: CameraState) => void }) {
  const status = useRef(onStatusChange); status.current = onStatusChange;
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(value); latest.current = value;
  const change = useRef(onCameraChange); change.current = onCameraChange;
  const runtime = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls; render: () => void } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setUnavailable(true); status.current('incomplete'); return; }
    setUnavailable(false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(taruviTokens.neutral[100]);
    const camera = new THREE.PerspectiveCamera(42, 1, .05, 200);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive conceptual room. Arrow keys orbit, Shift and arrows pan, plus and minus zoom.');
    canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(canvas);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.minDistance = .5; controls.maxDistance = 40;
    controls.minPolarAngle = .1;
    controls.maxPolarAngle = Math.PI * .49;
    const { width: w, height: h, depth: d } = latest.current.room;
    const solids: THREE.Mesh[] = [];
    const addBox = (size: Vector, position: Vector, color: string) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      mesh.position.set(...position); solids.push(mesh); scene.add(mesh); return mesh;
    };
    const addWall = (width: number, height: number, position: Vector, rotation: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ color: taruviTokens.neutral[200], roughness: 1 }));
      mesh.position.set(...position); mesh.rotation.y = rotation; solids.push(mesh); scene.add(mesh);
    };
    const floor = addBox([w, .12, d], [0, -.06, 0], taruviTokens.neutral[300]);
    addWall(w, h, [0, h / 2, -d / 2], 0);
    addWall(d, h, [-w / 2, h / 2, 0], Math.PI / 2);
    addWall(d, h, [w / 2, h / 2, 0], -Math.PI / 2);
    addBox([w * .5, .2, .45], [0, .1, -d / 2 + .35], taruviTokens.neutral[500]);
    addBox([w * .38, .42, .8], [-w * .12, .21, d * .13], taruviTokens.neutral[400]);
    addBox([w * .38, .48, .18], [-w * .12, .66, d * .13 + .3], taruviTokens.neutral[500]);
    addBox([.55, .34, .55], [w * .27, .17, d * .04], taruviTokens.neutral[200]);
    const selected = latest.current.surface === 'floor' ? floor : solids[1];
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(selected.geometry), new THREE.LineBasicMaterial({ color: taruviTokens.neutral[800] }));
    edges.position.copy(selected.position); edges.rotation.copy(selected.rotation); scene.add(edges);
    scene.add(new THREE.HemisphereLight(taruviTokens.surface.paper, taruviTokens.neutral[600], 2.5));
    const light = new THREE.DirectionalLight(taruviTokens.surface.paper, 2);
    light.position.set(2, 7, 5); scene.add(light);
    camera.position.set(...latest.current.camera.position);
    controls.target.set(...latest.current.camera.target); controls.update();
    let failed = false;
    const render = () => { if (!failed) { try { renderer.render(scene, camera); } catch { failed = true; setUnavailable(true); status.current('incomplete'); } } };
    const emit = () => {
      const next = constrainCamera({ position: camera.position.toArray() as Vector, target: controls.target.toArray() as Vector });
      camera.position.set(...next.position); controls.target.set(...next.target); controls.update(); render(); change.current(next);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      const offset = camera.position.clone().sub(controls.target);
      if (event.key === '+' || event.key === '=' || event.key === '-') {
        const nextLength = THREE.MathUtils.clamp(offset.length() * (event.key === '-' ? 1.15 : .87), .5, 40);
        offset.setLength(nextLength); camera.position.copy(controls.target).add(offset);
      } else if (event.shiftKey) {
        const delta = new THREE.Vector3(event.key === 'ArrowLeft' ? -.15 : event.key === 'ArrowRight' ? .15 : 0, event.key === 'ArrowUp' ? .15 : event.key === 'ArrowDown' ? -.15 : 0, 0).applyQuaternion(camera.quaternion);
        controls.target.add(delta); camera.position.add(delta);
      } else {
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + (event.key === 'ArrowUp' ? -.1 : event.key === 'ArrowDown' ? .1 : 0), .1, Math.PI * .49);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      }
      controls.update(); render(); emit();
    };
    const contextLost = (event: Event) => { event.preventDefault(); failed = true; setUnavailable(true); status.current('incomplete'); };
    const resize = () => {
      const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
    };
    controls.addEventListener('change', render); controls.addEventListener('end', emit);
    canvas.addEventListener('keydown', keydown); canvas.addEventListener('webglcontextlost', contextLost);
    const observer = new ResizeObserver(resize); observer.observe(container);
    runtime.current = { camera, controls, render }; resize();
    if (!failed) status.current('ready');
    return () => {
      runtime.current = null; observer.disconnect(); controls.removeEventListener('change', render); controls.removeEventListener('end', emit);
      canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('webglcontextlost', contextLost); controls.dispose();
      solids.forEach(mesh => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
      edges.geometry.dispose(); (edges.material as THREE.Material).dispose(); renderer.dispose(); canvas.remove();
    };
  }, [value.room.width, value.room.height, value.room.depth, value.surface]);
  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    current.camera.position.set(...value.camera.position); current.controls.target.set(...value.camera.target);
    current.controls.update(); current.render();
  }, [value.camera]);
  return <Box sx={{ position: 'relative' }}>
    <Box ref={host} sx={{ height: { xs: 320, md: 480 }, display: unavailable ? 'none' : 'block', '& canvas:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 } }} />
    {unavailable && <Box sx={{ p: 3, minHeight: 300 }}>
      <Alert severity="warning">Interactive 3D unavailable on this device. Your project and concept settings remain available.</Alert>
      <Box role="img" aria-label="Non-interactive conceptual floor plan" sx={{ m: 3, p: 3, border: '3px solid', borderColor: 'divider', bgcolor: 'background.default', textAlign: 'center' }}>
        <Typography>Feature wall</Typography><Box sx={{ my: 3, p: 2, bgcolor: 'action.selected' }}>Neutral seating · schematic only</Box>
        <Typography>{value.room.width} m × {value.room.depth} m · conceptual</Typography>
      </Box>
    </Box>}
    <Typography variant="caption" component="p" sx={{ position: unavailable ? 'static' : 'absolute', bottom: 0, left: 0, right: 0, p: 1.5, m: 0, bgcolor: 'background.paper', pointerEvents: 'none' }}>Geometry-only preview · Stone appearance unavailable from current gallery assets.</Typography>
  </Box>;
}
