// HMG-owned procedural furniture primitives. This module intentionally accepts no asset paths.
const finishColors = {
  'light-oak': 0xc4a477, walnut: 0x65452f, white: 0xe8e5dc,
  linen: 0xb8ae9c, charcoal: 0x424743, olive: 0x59634d, brass: 0x9b7946,
};

export function renderRoomObjects(THREE, room, objects) {
  const group = new THREE.Group();
  group.name = 'hmg-procedural-room-objects';
  const material = (color, rough = 0.82) => new THREE.MeshPhongMaterial({ color, shininess: Math.max(2, (1 - rough) * 28) });
  const addBox = (parent, mat, x, y, z, width, height, depth) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const addCylinder = (parent, mat, x, y, z, top, bottom, height) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 12), mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const create = (object) => {
    const dimensions = roomObjectSize(object.catalogId);
    if (!dimensions) return;
    const w = dimensions.widthM * 100, d = dimensions.depthM * 100, h = dimensions.heightM * 100;
    if (![w, d, h].every(Number.isFinite)) return;
    const root = new THREE.Group(); root.name = `hmg:${object.id}`;
    const wood = material(finishColors[object.finish] || finishColors.white), soft = material(object.finish === 'charcoal' ? 0x41494a : 0xb8ad9a), dark = material(0x49443c), metal = material(0x77766e, 0.45);
    if (object.kind === 'sofa' || object.kind === 'armchair' || object.kind === 'chair' || object.kind === 'office-chair') {
      const arm = object.kind === 'armchair' || object.kind === 'sofa';
      addBox(root, soft, 0, h * .43, 0, w * .88, h * .25, d * .78);
      addBox(root, soft, 0, h * .72, -d * .34, w * .88, h * .5, d * .18);
      if (arm) { addBox(root, wood, -w * .43, h * .55, 0, w * .13, h * .42, d * .82); addBox(root, wood, w * .43, h * .55, 0, w * .13, h * .42, d * .82); }
      for (const x of [-1, 1]) for (const z of [-1, 1]) addBox(root, metal, x * w * .34, h * .12, z * d * .3, 4, h * .24, 4);
      if (object.kind === 'office-chair') { addCylinder(root, metal, 0, h * .23, 0, 5, 5, h * .25); addBox(root, dark, 0, h * .08, 0, w * .8, 4, 4); }
    } else if (object.kind === 'coffee-table' || object.kind === 'side-table' || object.kind === 'bedside-table' || object.kind === 'desk' || object.kind === 'meeting-table') {
      const topY = h * .88, topThickness = Math.max(5, h * .09);
      addBox(root, wood, 0, topY, 0, w, topThickness, d);
      const legInsetX = w * .42, legInsetZ = d * .36, legH = topY - topThickness / 2;
      for (const x of [-1, 1]) for (const z of [-1, 1]) addBox(root, metal, x * legInsetX, legH / 2, z * legInsetZ, 5, legH, 5);
      if (object.kind === 'desk') addBox(root, wood, 0, h * .4, -d * .34, w * .58, h * .28, d * .12);
    } else if (object.kind === 'bed') {
      addBox(root, wood, 0, h * .18, 0, w, h * .28, d);
      addBox(root, soft, 0, h * .46, d * .03, w * .96, h * .32, d * .88);
      addBox(root, wood, 0, h * .64, -d * .44, w, h * .68, d * .08);
      addBox(root, material(0xeee9df), -w * .23, h * .65, -d * .29, w * .34, h * .12, d * .22);
      addBox(root, material(0xeee9df), w * .23, h * .65, -d * .29, w * .34, h * .12, d * .22);
    } else if (object.kind === 'wardrobe' || object.kind === 'dresser' || object.kind === 'bookshelf') {
      addBox(root, wood, 0, h / 2, 0, w, h, d);
      const frontZ = d / 2 + 1;
      if (object.kind === 'bookshelf') {
        for (let n = 1; n < 5; n++) addBox(root, material(0xa18a67), 0, h * n / 5, 0, w * .94, 5, d * .94);
        for (let n = 0; n < 6; n++) addBox(root, material([0x78624a, 0x8b7460, 0x5d685e][n % 3]), -w * .31 + n * w * .12, h * .28, frontZ, w * .075, h * .22, 7);
      } else {
        const divisions = object.kind === 'dresser' ? 4 : 2;
        for (let n = 0; n < divisions; n++) {
          const y = h * (.18 + .65 * (n + .5) / divisions);
          addBox(root, material(finishColors[object.finish]), 0, y, frontZ, w * .91, h * .65 / divisions - 3, 4);
          addCylinder(root, metal, 0, y, frontZ + 4, 2, 2, 6);
        }
      }
    } else if (object.kind === 'floor-lamp' || object.kind === 'table-lamp') {
      addCylinder(root, metal, 0, h * .04, 0, w * .38, w * .38, Math.max(4, h * .08));
      addCylinder(root, metal, 0, h * .46, 0, 2.3, 2.3, h * .78);
      addCylinder(root, material(0xe7dfcf), 0, h * .78, 0, w * .12, w * .32, h * .34);
    }
    root.position.set(object.xM * 100, 0, object.zM * 100);
    root.rotation.y = object.rotationDeg * Math.PI / 180;
    root.userData.hmgRoomObjectId = object.id;
    group.add(root);
  };
  for (const object of objects || []) create(object);
  return group;
}

export const roomObjectDimensions = {
  'sofa-modern':[2.1,.86,.82], 'armchair-modern':[.86,.82,.82], 'chair-dining':[.48,.5,.9], 'chair-office':[.62,.62,1.02],
  'coffee-table':[1.1,.6,.42], 'side-table':[.48,.48,.52], 'bedside-table':[.48,.42,.55], 'desk-office':[1.4,.68,.75],
  'meeting-table':[2.2,1.05,.75], 'bed-queen':[1.6,2.05,.58], 'wardrobe-double':[1.5,.62,2.1], 'dresser-modern':[1.2,.48,.86],
  'bookshelf-open':[.9,.32,1.8], 'floor-lamp':[.38,.38,1.55], 'table-lamp':[.28,.28,.48],
};
function roomObjectSize(catalogId) { const d = roomObjectDimensions[catalogId]; return d ? { widthM: d[0], depthM: d[1], heightM: d[2] } : null; }

export function disposeRoomObjects(THREE, group) {
  if (!group) return;
  group.traverse((node) => { if (!node.geometry || !node.material) return; node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose()); });
  group.parent?.remove(group);
}
