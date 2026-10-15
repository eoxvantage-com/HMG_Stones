# Whole-home material bug fix

Room-card follow-up: room name/dimensions, floor status chip and edit action all explicitly target that room's floor using the existing onEditRoom path. Active-room actions remain enabled so users can return from a wall to its floor. Reuse existing save-before-switch protection; keep status-only behavior when no editing callback is supplied. Tests cover assigned and unassigned floor chips and active rooms.

Follow-up 2026-10-15: whole-home still targeted the current room because the canvas had no surface picking. Extend the existing viewer with floor/wall raycasting (ignore drag gestures), an always-visible room selector, and save-before-switch using the existing authenticated save command. Regression coverage must assign two different rooms in sequence and preserve the first room; failed saves must not switch rooms. No schema changes.

Follow-up verification: typecheck passed; 23 studio/plan test files and 139 tests passed, including two-room assignments, failed-save retention, room dropdown and real Three.js raycasting. Browser inventory has no connected session; user visual validation remains required.

Scope: connect existing studio assignment state to the whole-home Three.js renderer.

Existing flow: authenticated HMG workflow returns project.planUploads and stoneStudioDesigns; StoneStudio edits a StudioDesign with A/B assignments and saves through saveStudioDesign. FullHomePlanViewer currently only displays plan assignment chips.

Pipeline: inspect current implementation and logs, reproduce with regression tests, implement mapping and private texture lifecycle, verify typecheck and tests, user visual validation. No database/schema or auth changes. No commit, push, build or deployment.

Affected components: StoneStudio, FullHomePlanViewer; small assignment/texture helpers and regression tests. Reuse requestPrivateImageUrl for authenticated official HMG imagery. Preserve live draft priority, clear operations and independent wall sides; do not reset camera on material changes. Surface image failures explicitly. Provide visible room selection using existing unsaved-change confirmation.

Validation: typecheck passed. Final serial run of studio3d, plan3d and sales-workspace: 24 files / 153 tests passed. Full-suite run exposed an unrelated existing assertion in src/taruviClient.safety.test.ts rejecting any env.TARUVI_API_KEY reference in vite.config.ts, including the server gateway configuration. No Vite configuration was changed. UI timeouts from the earlier run passed on the final serial run. Browser inventory contained no connected sessions, so authenticated image delivery and visual QA require user validation. Whole-home mode fits textures to surfaces; detailed tile/slab/grout layout remains in the room viewer.
