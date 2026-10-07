import { roomObjectDimensions } from './roomObjects.js';
import colors from './tokens.js';

/** Draw catalog-sized furniture footprints over the 2D room plan. */
export function drawRoomObjects2d(ctx, planner, objects) {
  if (!ctx || !planner) return;
  for (const item of objects || []) {
    const dimensions = roomObjectDimensions[item.catalogId];
    if (!dimensions) continue;
    const [widthM, depthM] = dimensions;
    // Keep local footprint dimensions unrotated; the canvas transform below
    // rotates them exactly once, matching the 3D renderer and room validator.
    const width = widthM * 100 * planner.pixelsPerCm;
    const depth = depthM * 100 * planner.pixelsPerCm;
    const x = planner.convertX(item.xM * 100);
    const y = planner.convertY(item.zM * 100);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((item.rotationDeg * Math.PI) / 180);
    ctx.fillStyle = colors.soft;
    ctx.strokeStyle = colors.oliveDark;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-width / 2, -depth / 2, width, depth);
    ctx.strokeRect(-width / 2, -depth / 2, width, depth);
    ctx.fillStyle = colors.ink;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.kind.replaceAll('-', ' '), 0, 0, Math.max(24, width - 4));
    ctx.restore();
  }
}
