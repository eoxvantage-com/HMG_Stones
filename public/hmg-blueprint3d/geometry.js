const directions = ['north', 'east', 'south', 'west'];
// A polygon can join opposite corners of the allowed 20m x 20m coordinate box.
const MAX_POLYGON_EDGE_M = Math.hypot(20, 20);
export function roomIds(id) { return { cornerIds: ['nw', 'ne', 'se', 'sw'].map(x => `${id}:${x}`), wallIds: directions.map(x => `${id}:${x}`), wallSideIds: directions.map(x => `${id}:${x}:interior`) }; }
export const roomObjectCatalog = [
    { catalogId: 'sofa-modern', kind: 'sofa', label: 'Modern 3-seat sofa', widthM: 2.1, depthM: .86, heightM: .82, finish: 'linen', shape: 'seat' },
    { catalogId: 'armchair-modern', kind: 'armchair', label: 'Lounge armchair', widthM: .86, depthM: .82, heightM: .82, finish: 'olive', shape: 'seat' },
    { catalogId: 'chair-dining', kind: 'chair', label: 'Dining chair', widthM: .48, depthM: .5, heightM: .9, finish: 'light-oak', shape: 'seat' },
    { catalogId: 'chair-office', kind: 'office-chair', label: 'Task chair', widthM: .62, depthM: .62, heightM: 1.02, finish: 'charcoal', shape: 'seat' },
    { catalogId: 'coffee-table', kind: 'coffee-table', label: 'Coffee table', widthM: 1.1, depthM: .6, heightM: .42, finish: 'walnut', shape: 'table' },
    { catalogId: 'side-table', kind: 'side-table', label: 'Side table', widthM: .48, depthM: .48, heightM: .52, finish: 'light-oak', shape: 'table' },
    { catalogId: 'bedside-table', kind: 'bedside-table', label: 'Bedside table', widthM: .48, depthM: .42, heightM: .55, finish: 'walnut', shape: 'table' },
    { catalogId: 'desk-office', kind: 'desk', label: 'Writing desk', widthM: 1.4, depthM: .68, heightM: .75, finish: 'light-oak', shape: 'table' },
    { catalogId: 'meeting-table', kind: 'meeting-table', label: 'Meeting table', widthM: 2.2, depthM: 1.05, heightM: .75, finish: 'walnut', shape: 'table' },
    { catalogId: 'bed-queen', kind: 'bed', label: 'Queen bed', widthM: 1.6, depthM: 2.05, heightM: .58, finish: 'white', shape: 'bed' },
    { catalogId: 'wardrobe-double', kind: 'wardrobe', label: 'Double wardrobe', widthM: 1.5, depthM: .62, heightM: 2.1, finish: 'light-oak', shape: 'cabinet' },
    { catalogId: 'dresser-modern', kind: 'dresser', label: 'Six-drawer dresser', widthM: 1.2, depthM: .48, heightM: .86, finish: 'walnut', shape: 'cabinet' },
    { catalogId: 'bookshelf-open', kind: 'bookshelf', label: 'Open bookshelf', widthM: .9, depthM: .32, heightM: 1.8, finish: 'light-oak', shape: 'cabinet' },
    { catalogId: 'floor-lamp', kind: 'floor-lamp', label: 'Tripod floor lamp', widthM: .38, depthM: .38, heightM: 1.55, finish: 'brass', shape: 'lamp' },
    { catalogId: 'table-lamp', kind: 'table-lamp', label: 'Table lamp', widthM: .28, depthM: .28, heightM: .48, finish: 'brass', shape: 'lamp' },
];
const presetObjects = {
    'Living room': [['sofa-modern', 2.5, .68, 0], ['armchair-modern', .7, 2.35, 90], ['coffee-table', 2.5, 1.75, 0], ['floor-lamp', 4.25, .65, 0]],
    Bedroom: [['bed-queen', 2, 1.35, 0], ['wardrobe-double', .85, 3, 90], ['dresser-modern', 3.3, 3.05, 0], ['bedside-table', .85, 1.35, 0]],
    Office: [['desk-office', 3.6, 1.05, 0], ['chair-office', 3.6, 1.9, 0], ['bookshelf-open', .55, 2.8, 90]],
    'Meeting / reception': [['meeting-table', 3.5, 2, 0], ['chair-office', 2, 2, 90], ['chair-office', 5, 2, 270], ['sofa-modern', 3.5, .65, 0]],
};
const catalogById = new Map(roomObjectCatalog.map(x => [x.catalogId, x]));
const rotation = (n) => ((Math.round(n / 90) * 90 % 360 + 360) % 360);
function footprint(item) { const meta = catalogById.get(item.catalogId); if (!meta || meta.kind !== item.kind)
    return null; const turned = item.rotationDeg === 90 || item.rotationDeg === 270; return { width: turned ? meta.depthM : meta.widthM, depth: turned ? meta.widthM : meta.depthM }; }
function fitsObject(room, item, others = [], ignoreId) { const size = footprint(item); if (!size)
    return false; const halfX = size.width / 2, halfZ = size.depth / 2; if (item.xM - halfX < 0 || item.zM - halfZ < 0 || item.xM + halfX > room.length || item.zM + halfZ > room.width)
    return false; if (room.perimeter && !rectangleInsidePolygon(room.perimeter, item.xM - halfX, item.zM - halfZ, item.xM + halfX, item.zM + halfZ))
    return false; return !others.some(other => { if (other.id === ignoreId)
    return false; const otherSize = footprint(other); return !!otherSize && Math.abs(item.xM - other.xM) < (size.width + otherSize.width) / 2 + .03 && Math.abs(item.zM - other.zM) < (size.depth + otherSize.depth) / 2 + .03; }); }
function findPlacement(room, item, others) { const size = footprint(item); if (!size)
    return null; const maxX = room.length - size.width / 2, minX = size.width / 2, maxZ = room.width - size.depth / 2, minZ = size.depth / 2; for (let z = minZ; z <= maxZ; z += .25)
    for (let x = minX; x <= maxX; x += .25) {
        const candidate = { ...item, xM: Number(x.toFixed(2)), zM: Number(z.toFixed(2)) };
        if (fitsObject(room, candidate, others))
            return candidate;
    } return null; }
function objectFor(catalogId, xM, zM, deg = 0, id = crypto.randomUUID()) { const meta = catalogById.get(catalogId); return meta ? { id, catalogId, kind: meta.kind, xM, zM, rotationDeg: deg, finish: meta.finish } : null; }
export function createDesign(projectId, template = 'Living room') {
    const id = crypto.randomUUID(), roomId = crypto.randomUUID();
    const [length, width] = template === 'Office' ? [6, 4] : template === 'Bedroom' ? [4.5, 3.8] : template === 'Meeting / reception' ? [7, 5] : [5, 4];
    const room = { id: roomId, name: template, length, width, height: 2.8, unit: 'm', ...roomIds(roomId) };
    const objects = [];
    for (const [catalogId, x, z, deg] of presetObjects[template] || []) {
        const item = objectFor(catalogId, x, z, deg);
        if (item && fitsObject(room, item, objects))
            objects.push(item);
    }
    return { schemaVersion: 1, id, projectId, name: `${template} design`, geometryRevision: 1, room, objects, activeOption: 'A', options: { A: { assignments: {} }, B: { assignments: {} } }, camera: { position: [length * 1.3, 6, width * 1.5], target: [length / 2, 1, width / 2] } };
}
export function addRoomObject(design, kindOrCatalogId, position) { const entry = roomObjectCatalog.find(x => x.catalogId === kindOrCatalogId || x.kind === kindOrCatalogId); if (!entry)
    return null; const objects = design.objects || []; const item = objectFor(entry.catalogId, position?.xM ?? design.room.length / 2, position?.zM ?? design.room.width / 2); if (!item)
    return null; const placed = position ? (fitsObject(design.room, item, objects) ? item : null) : findPlacement(design.room, item, objects); return placed ? { ...design, objects: [...objects, placed] } : null; }
export function moveRoomObject(design, id, position) { const objects = design.objects || [], item = objects.find(x => x.id === id); if (!item || !Number.isFinite(position.xM) || !Number.isFinite(position.zM))
    return null; const moved = { ...item, ...position }; if (!fitsObject(design.room, moved, objects, id))
    return null; return { ...design, objects: objects.map(x => x.id === id ? moved : x) }; }
export function rotateRoomObject(design, id, degrees) { const objects = design.objects || [], item = objects.find(x => x.id === id); if (!item || !Number.isFinite(degrees))
    return null; const moved = { ...item, rotationDeg: rotation(item.rotationDeg + degrees) }; if (!fitsObject(design.room, moved, objects, id))
    return null; return { ...design, objects: objects.map(x => x.id === id ? moved : x) }; }
export function removeRoomObject(design, id) { const objects = design.objects || []; return { ...design, objects: objects.filter(x => x.id !== id) }; }
export function edgeId(roomId, startVertexId, endVertexId) { const [start, end] = [startVertexId, endVertexId].sort((a, b) => a < b ? -1 : a > b ? 1 : 0); return `${roomId}:edge:${start}:${end}`; }
const EPSILON = 1e-8;
const cross = (a, b, c) => (b.xM - a.xM) * (c.zM - a.zM) - (b.zM - a.zM) * (c.xM - a.xM);
function onSegment(a, b, p) { return Math.abs(cross(a, b, p)) <= EPSILON && p.xM >= Math.min(a.xM, b.xM) - EPSILON && p.xM <= Math.max(a.xM, b.xM) + EPSILON && p.zM >= Math.min(a.zM, b.zM) - EPSILON && p.zM <= Math.max(a.zM, b.zM) + EPSILON; }
function segmentsIntersect(a, b, c, d) { const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b); if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON)))
    return true; return (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) || (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) || (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) || (Math.abs(cdB) <= EPSILON && onSegment(c, d, b)); }
/** V2 outline contract: 4-20 uniquely identified vertices, within 0..20m bounds, edges >=0.05m; room bounds must enclose it. */
export function validateRoomPolygon(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 4 || vertices.length > 20)
        return { ok: false, reason: 'A room outline must contain between 4 and 20 vertices.' };
    const ids = new Set();
    for (const vertex of vertices) {
        if (!object(vertex) || !exact(vertex, ['id', 'xM', 'zM']) || !identifier(vertex.id) || ids.has(vertex.id) || !bounded(vertex.xM, 0, 20) || !bounded(vertex.zM, 0, 20))
            return { ok: false, reason: 'Vertices need unique IDs and finite coordinates between 0 and 20 metres.' };
        ids.add(vertex.id);
    }
    const polygon = vertices;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], edgeLength = Math.hypot(a.xM - b.xM, a.zM - b.zM);
        if (edgeLength <= EPSILON)
            return { ok: false, reason: 'Adjacent vertices must not be duplicated or form a zero-length edge.' };
        if (edgeLength < .05)
            return { ok: false, reason: 'Room outline edges must be at least 0.05 metres long.' };
        for (let j = i + 1; j < polygon.length; j++)
            if (Math.hypot(a.xM - polygon[j].xM, a.zM - polygon[j].zM) <= EPSILON)
                return { ok: false, reason: 'Polygon vertices must have distinct coordinates.' };
    }
    for (let i = 0; i < polygon.length; i++) {
        const previous = polygon[(i + polygon.length - 1) % polygon.length], current = polygon[i], next = polygon[(i + 1) % polygon.length];
        const reversesOnSameLine = Math.abs(cross(previous, current, next)) <= EPSILON && (previous.xM - current.xM) * (next.xM - current.xM) + (previous.zM - current.zM) * (next.zM - current.zM) > EPSILON;
        if (reversesOnSameLine)
            return { ok: false, reason: 'Adjacent outline edges must not overlap or double back.' };
    }
    let twiceArea = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        twiceArea += a.xM * b.zM - b.xM * a.zM;
    }
    if (Math.abs(twiceArea) <= EPSILON)
        return { ok: false, reason: 'The room outline must enclose non-zero area.' };
    for (let i = 0; i < polygon.length; i++) {
        const iNext = (i + 1) % polygon.length;
        for (let j = i + 1; j < polygon.length; j++) {
            const jNext = (j + 1) % polygon.length;
            if (i === j || iNext === j || jNext === i)
                continue;
            if (segmentsIntersect(polygon[i], polygon[iNext], polygon[j], polygon[jNext]))
                return { ok: false, reason: 'Room outline edges must not cross or touch non-adjacent edges.' };
        }
    }
    return { ok: true };
}
export function pointInRoom(room, point) { if (!Number.isFinite(point.xM) || !Number.isFinite(point.zM))
    return false; const polygon = room.perimeter ?? [{ id: 'nw', xM: 0, zM: 0 }, { id: 'ne', xM: room.length, zM: 0 }, { id: 'se', xM: room.length, zM: room.width }, { id: 'sw', xM: 0, zM: room.width }]; if (room.perimeter && !validateRoomPolygon(polygon).ok)
    return false; let inside = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(a, b, point))
        return true;
    const intersects = (a.zM > point.zM) !== (b.zM > point.zM) && point.xM < (b.xM - a.xM) * (point.zM - a.zM) / (b.zM - a.zM) + a.xM;
    if (intersects)
        inside = !inside;
} return inside; }
function rectangleInsidePolygon(polygon, minX, minZ, maxX, maxZ) {
    const room = { id: 'bounds', name: 'bounds', length: 20, width: 20, height: 2, unit: 'm', ...roomIds('bounds'), perimeter: polygon };
    const corners = [{ xM: minX, zM: minZ }, { xM: maxX, zM: minZ }, { xM: maxX, zM: maxZ }, { xM: minX, zM: maxZ }];
    if (!corners.every(point => pointInRoom(room, point)))
        return false;
    // Reject a concave notch whose outline runs through the furniture interior even when all four corners are inside.
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        let t0 = 0, t1 = 1;
        const dx = b.xM - a.xM, dz = b.zM - a.zM;
        for (const [p, q] of [[-dx, a.xM - minX], [dx, maxX - a.xM], [-dz, a.zM - minZ], [dz, maxZ - a.zM]]) {
            if (Math.abs(p) <= EPSILON) {
                if (q < 0) {
                    t0 = 1;
                    t1 = 0;
                    break;
                }
            }
            else {
                const t = q / p;
                if (p < 0)
                    t0 = Math.max(t0, t);
                else
                    t1 = Math.min(t1, t);
            }
        }
        if (t0 <= t1) {
            const t = (t0 + t1) / 2, x = a.xM + t * dx, z = a.zM + t * dz;
            if (x > minX + EPSILON && x < maxX - EPSILON && z > minZ + EPSILON && z < maxZ - EPSILON)
                return false;
        }
    }
    return true;
}
export function surfaces(design) { const r = design.room; if (design.schemaVersion === 1)
    return [{ id: `${r.id}:floor`, name: 'Floor', kind: 'floor', width: r.length, height: r.width, area: r.length * r.width }, ...directions.map((dir, i) => ({ id: r.wallSideIds[i], name: dir[0].toUpperCase() + dir.slice(1) + ' interior wall', kind: 'wall', width: i % 2 ? r.width : r.length, height: r.height, area: (i % 2 ? r.width : r.length) * r.height }))]; const perimeter = design.room.perimeter; let twiceArea = 0; for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    twiceArea += a.xM * b.zM - b.xM * a.zM;
} return [{ id: `${r.id}:floor`, name: 'Floor', kind: 'floor', width: r.length, height: r.width, area: Math.abs(twiceArea) / 2 }, ...perimeter.map((start, i) => { const end = perimeter[(i + 1) % perimeter.length], length = Math.hypot(end.xM - start.xM, end.zM - start.zM); return { id: edgeId(r.id, start.id, end.id), name: `Wall ${i + 1} interior wall`, kind: 'wall', width: length, height: r.height, area: length * r.height }; })]; }
export function resizeRoom(design, patch) { const next = { ...design, geometryRevision: design.geometryRevision + 1, room: { ...design.room, ...patch }, options: { A: { assignments: { ...design.options.A.assignments } }, B: { assignments: { ...design.options.B.assignments } } } }; for (const option of ['A', 'B'])
    for (const surface of surfaces(next)) {
        const a = next.options[option].assignments[surface.id];
        if (a?.mode === 'surface')
            next.options[option].assignments[surface.id] = { ...a, widthM: surface.width, heightM: surface.height };
    } if (!parseStudioDesign(next))
    throw new Error('Use finite dimensions from 1 to 20 metres; height 2 to 6 metres.'); return next; }
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const exact = (v, keys) => Object.keys(v).every(k => keys.includes(k));
const identifier = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export function parseStudioDesign(value) {
    if (!object(value) || !exact(value, ['schemaVersion', 'id', 'projectId', 'name', 'geometryRevision', 'room', 'activeOption', 'options', 'camera', 'objects']) || ![1, 2].includes(value.schemaVersion) || !identifier(value.id) || !identifier(value.projectId) || typeof value.name !== 'string' || value.name.length > 120 || !Number.isSafeInteger(value.geometryRevision) || value.geometryRevision < 1 || value.geometryRevision > 1000000 || !object(value.room))
        return null;
    const version = value.schemaVersion;
    const r = value.room;
    if (!exact(r, version === 1 ? ['id', 'name', 'length', 'width', 'height', 'unit', 'cornerIds', 'wallIds', 'wallSideIds'] : ['id', 'name', 'length', 'width', 'height', 'unit', 'cornerIds', 'wallIds', 'wallSideIds', 'perimeter']) || !identifier(r.id) || typeof r.name !== 'string' || r.name.length > 120 || !bounded(r.length, 1, 20) || !bounded(r.width, 1, 20) || !bounded(r.height, 2, 6) || !['m', 'ft'].includes(r.unit))
        return null;
    const ids = roomIds(r.id);
    for (const k of ['cornerIds', 'wallIds', 'wallSideIds'])
        if (JSON.stringify(r[k]) !== JSON.stringify(ids[k]))
            return null;
    const parsedRoom = r;
    if (version === 2) {
        if (!validateRoomPolygon(r.perimeter).ok)
            return null;
        const perimeter = r.perimeter;
        if (perimeter.some((vertex) => vertex.xM > r.length || vertex.zM > r.width))
            return null;
    }
    if (!['A', 'B'].includes(value.activeOption) || !object(value.options) || !object(value.camera) || !exact(value.options, ['A', 'B']) || !exact(value.camera, ['position', 'target']))
        return null;
    for (const key of ['position', 'target'])
        if (!Array.isArray(value.camera[key]) || value.camera[key].length !== 3 || !value.camera[key].every((n) => bounded(n, -100, 100)))
            return null;
    if (Math.hypot(...value.camera.position.map((n, i) => n - value.camera.target[i])) < .1)
        return null;
    const known = new Set(version === 1 ? [`${r.id}:floor`, ...ids.wallSideIds] : surfaces({ ...value, room: parsedRoom }).map(surface => surface.id));
    for (const key of ['A', 'B']) {
        const option = value.options[key];
        if (!object(option) || !exact(option, ['assignments']) || !object(option.assignments) || Object.keys(option.assignments).length > (version === 1 ? 5 : 21))
            return null;
        for (const [id, a] of Object.entries(option.assignments)) {
            if (!known.has(id) || !object(a) || !exact(a, ['assetId', 'rotation', 'mode', 'widthM', 'heightM', 'groutMm', 'groutColor', 'dimensionsAssumed']) || !identifier(a.assetId) || ![0, 90].includes(a.rotation) || !['surface', 'tile', 'slab'].includes(a.mode) || !bounded(a.widthM, .05, a.mode === 'surface' ? MAX_POLYGON_EDGE_M : 10) || !bounded(a.heightM, .05, a.mode === 'surface' ? 20 : 10) || (a.mode === 'surface' && (a.groutMm !== 0 || a.dimensionsAssumed !== true)) || !bounded(a.groutMm, 0, 20) || typeof a.groutColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a.groutColor) || typeof a.dimensionsAssumed !== 'boolean')
                return null;
        }
    }
    const objects = value.objects === undefined ? [] : value.objects;
    if (!Array.isArray(objects) || objects.length > 40)
        return null;
    const objectIds = new Set();
    const seenObjects = [];
    for (const item of objects) {
        if (!object(item) || !exact(item, ['id', 'catalogId', 'kind', 'xM', 'zM', 'rotationDeg', 'finish']) || !identifier(item.id) || objectIds.has(item.id) || typeof item.catalogId !== 'string' || typeof item.kind !== 'string' || !bounded(item.xM, 0, r.length) || !bounded(item.zM, 0, r.width) || ![0, 90, 180, 270].includes(item.rotationDeg) || !['light-oak', 'walnut', 'white', 'linen', 'charcoal', 'olive', 'brass'].includes(item.finish))
            return null;
        const meta = catalogById.get(item.catalogId);
        if (!meta || meta.kind !== item.kind || !fitsObject(parsedRoom, item, seenObjects))
            return null;
        objectIds.add(item.id);
        seenObjects.push(item);
    }
    return JSON.parse(JSON.stringify({ ...value, objects }));
}
export function toBlueprintFloorplan(design) { const r = design.room; const xy = [[-5, -5], [r.length * 100 + 5, -5], [r.length * 100 + 5, r.width * 100 + 5], [-5, r.width * 100 + 5]]; return { corners: Object.fromEntries(r.cornerIds.map((id, i) => [id, { x: xy[i][0], y: xy[i][1] }])), walls: r.wallIds.map((id, i) => ({ id, corner1: r.cornerIds[i], corner2: r.cornerIds[(i + 1) % 4], frontTexture: { url: '', stretch: false, scale: 100 }, backTexture: { url: '', stretch: false, scale: 100 } })), wallTextures: [], floorTextures: {}, newFloorTextures: {} }; }
