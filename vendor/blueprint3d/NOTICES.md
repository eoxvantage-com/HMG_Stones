# Pinned Blueprint3D runtime

Original: https://github.com/furnishup/blueprint3d
Commit: cac8b62c1a3839e929334bdc125bf8a74866be9e
Copyright 2015 FurnishUp Inc. MIT; full license is in upstream/LICENSE.txt and public runtime.

Only original src, declaration files, build metadata and original jQuery JavaScript were copied.
NO demo photograph, furniture model, wood, brick, marble texture or lightmap is included.

Runtime dependencies are isolated from the host:
- Three.js 0.69.0, npm official archive; MIT notice THREE-LICENSE.txt.
- jQuery 1.11.3, exact original example JavaScript; MIT notice JQUERY-LICENSE.txt.
- No Bootstrap, tours, furniture catalogue or optional polygon dependencies execute.

Reproduce local runtime: node scripts/blueprint3d/build-runtime.mjs
The existing installed TypeScript compiler transpiles original namespaces in dependency order.
No legacy package installation, upstream install hooks or host Three upgrade is used.
Build manifest records source ordering and compiled SHA-256.

Contained compatibility patches live in the build script, leaving upstream source unchanged:
1. Remove all upstream default material/lightmap loads; retain neutral base geometry.
2. Disable the perpetual timeout/animation loop; expose renderOnce for dirty-frame scheduling.
3. Expose disposal; release mesh geometries, materials, renderer/context and controls listeners.
4. Dispose removed geometry/materials during room resize; cap optional renderer pixel ratio to 2.
5. Disable preserveDrawingBuffer. No screenshots or texture uploads are implied.

The self-hosted frame isolates legacy globals and CSS. It is trusted pinned code, not a
security boundary against malicious same-origin JavaScript; its CSP denies all network
connections and permits image loads only from the same origin. The sandbox disallows navigation/popups/forms. Messages
require exact origin, frame source, random instance nonce and bounded document schema.
No session tokens, API keys, private notes, renderer objects or arbitrary URLs enter it.

Adapter uses the original floorplanner and original model/3D renderer. Stable rectangular
geometry derives from explicit room corner/wall/side IDs. Original arbitrary corner
editing is disabled until nonrectangular assignment reconciliation can be guaranteed.
Pointer picking intersects all interior wall/floor planes together and chooses nearest.
Selection tint and neutral geometry are computed UI, not HMG material photographs.

The original 94 gallery assets remain inspiration-only. Separately sourced official HMG
product photographs can be applied using approved asset IDs, resolved only through the
same-origin authenticated /api/hmg/image-ticket and short-lived
/api/hmg/private-images/<ticket> server allowlist. No document-provided URL
is loaded. Source rights and provenance remain those of HMG, not this MIT foundation.

Material overlays clone exact original interior wall/floor planes. Default surface mode
maps the entire original photograph to the whole surface, deliberately adjusting its
proportions without cropping its watermark. This is visual placement, not physical stock
size or a measured slab. Selection uses boundary outlines, never a filled colour tint.

In advanced tile/slab modes, physical preview
width/height and grout are explicit user assumptions. Tile mode repeats whole original
photographs; single-slab mode leaves the remainder visibly uncovered. The photograph is
contained without distortion or cropping, retaining source watermarks; mismatched aspect
ratios show padding in the selected grout colour. Rotation is 0 or 90 degrees. None of
this establishes measured slab dimensions, seamlessness, cutting plans or bookmatching.
2D shows the same floor photograph and a selected-wall elevation inset; 3D shows each
exact interior surface independently. A/B changes materials, not geometry or camera.

The frame limits material canvases to a longest side of 2048 pixels and cached source
photographs to 1024 pixels. At most 12 sources are cached. Loading validates image size,
times out, cancels on disposal, suppresses stale completions and never retries merely
because the camera or selection changes. Failed assignments remain saved and an explicit
status reports missing images. Changing an option/material permits a deliberate retry.

Validation: 23 focused geometry, adapter, namespace, material math and lifecycle tests
passed after independent source review. Real browser visual proof is a separate gate;
these tests do not establish pixel-perfect rendering or a deployed frontend.

Frame removal plus explicit disposal releases legacy document/window listeners; dirty
frames and the camera debounce are cancelled. WebGL failure retains original 2D plan.
