export function materialAssetPath(id, imageUrls = {}) { if (!/^hmg-stone-[a-z0-9_-]{1,80}$/.test(id))
    throw Error('Unapproved material identifier'); const url = imageUrls[id]; if (typeof url !== 'string' || !/^blob:[^\s]+$/.test(url))
    throw Error('Private material image unavailable'); return url; }
export function layoutMetrics(a) { return { width: a.rotation === 90 ? a.heightM : a.widthM, height: a.rotation === 90 ? a.widthM : a.heightM, gap: a.groutMm / 1000, boundaries: a.mode === 'slab' }; }
export function surfaceUv(kind, p, ends, width, height) { if (kind === 'floor')
    return [p[0] / (width * 100), 1 - p[2] / (height * 100)]; const [[x, z], [ex, ez]] = ends; const dx = ex - x, dz = ez - z; return [((p[0] - x) * dx + (p[2] - z) * dz) / (dx * dx + dz * dz), p[1] / (height * 100)]; }
export function sourceFit(sourceWidth, sourceHeight, width, height) { const scale = Math.min(width / sourceWidth, height / sourceHeight); const dw = sourceWidth * scale, dh = sourceHeight * scale; return [(width - dw) / 2, (height - dh) / 2, dw, dh]; }
/** Photographic pixels only: no recolouring, synthesis, seamlessness or bookmatching. */
export function paintSurface(image, a, width, height, makeCanvas = () => document.createElement('canvas')) {
    const { width: tw, height: th, gap, boundaries } = layoutMetrics(a);
    const canvas = makeCanvas();
    const scale = Math.min(180, 2048 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw Error('Canvas unavailable');
    if (a.mode === 'surface') {
        ctx.save();
        if (a.rotation === 90) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(image, 0, 0, canvas.height, canvas.width);
        }
        else
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        return canvas;
    }
    const cell = makeCanvas();
    cell.width = Math.max(2, Math.round((tw + gap) * scale));
    cell.height = Math.max(2, Math.round((th + gap) * scale));
    const c = cell.getContext('2d');
    if (!c)
        throw Error('Canvas unavailable');
    c.fillStyle = a.groutColor;
    c.fillRect(0, 0, cell.width, cell.height);
    const w = Math.max(1, cell.width - gap * scale), h = Math.max(1, cell.height - gap * scale);
    c.save();
    if (a.rotation === 90) {
        c.translate(w, 0);
        c.rotate(Math.PI / 2);
        drawPhoto(c, image, h, w);
    }
    else
        drawPhoto(c, image, w, h);
    c.restore();
    if (boundaries) {
        c.strokeStyle = a.groutColor;
        c.lineWidth = 1;
        c.strokeRect(.5, .5, Math.max(0, w - 1), Math.max(0, h - 1));
    }
    if (a.mode === 'slab') {
        ctx.drawImage(cell, 0, 0);
        return canvas;
    }
    const pattern = ctx.createPattern(cell, 'repeat');
    if (!pattern)
        throw Error('Material pattern unavailable');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
}
function drawPhoto(ctx, image, width, height) { const source = image; const sw = source.naturalWidth || source.width || 1, sh = source.naturalHeight || source.height || 1; const [x, y, w, h] = sourceFit(sw, sh, width, height); ctx.drawImage(image, 0, 0, sw, sh, x, y, w, h); }
export function boundaryEdges(faces) { const edges = new Map(); for (const face of faces)
    for (const pair of [[face.a, face.b], [face.b, face.c], [face.c, face.a]]) {
        const key = [...pair].sort((a, b) => a - b).join(':');
        const edge = edges.get(key);
        if (edge)
            edge.count++;
        else
            edges.set(key, { count: 1, pair });
    } return [...edges.values()].filter(e => e.count === 1).map(e => e.pair); }
