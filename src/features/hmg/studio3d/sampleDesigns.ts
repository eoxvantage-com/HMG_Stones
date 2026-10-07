import { addRoomObject, createDesign, roomIds } from './geometry';
import type { StudioDesignV2, StudioPolygonVertex } from './types';

export interface SpatialSample {
  name: 'Harbour Loft' | 'Atrium Gallery';
  roomType: string;
  brief: { room: string; application: string; quantity: string; priorities: string[] };
  design: StudioDesignV2;
}

const definitions = [
  {
    key: 'harbour-loft',
    name: 'Harbour Loft' as const,
    roomType: 'L-shaped open-plan living room',
    length: 8,
    width: 7,
    vertices: [[0, 0], [8, 0], [8, 3.1], [4.7, 3.1], [4.7, 7], [0, 7]],
    objects: [
      ['sofa-modern', 2.25, 0.9],
      ['coffee-table', 2.25, 2.05],
      ['armchair-modern', 3.55, 5.7],
      ['floor-lamp', 0.65, 5.9],
    ] as const,
  },
  {
    key: 'atrium-gallery',
    name: 'Atrium Gallery' as const,
    roomType: 'Octagonal reception and gallery',
    length: 8,
    width: 8,
    vertices: [[2, 0], [6, 0], [8, 2], [8, 6], [6, 8], [2, 8], [0, 6], [0, 2]],
    objects: [
      ['meeting-table', 4, 4],
      ['chair-office', 2.3, 4],
      ['chair-office', 5.7, 4],
      ['floor-lamp', 4, 1.3],
    ] as const,
  },
] as const;

export function createSampleDesigns(projectIds: Partial<Record<SpatialSample['name'], string>> = {}): SpatialSample[] {
  return definitions.map((definition) => {
    const roomId = `hmg-${definition.key}-room`;
    const projectId = projectIds[definition.name] ?? `hmg-${definition.key}-project`;
    const rectangular = createDesign(projectId, 'Meeting / reception');
    const perimeter: StudioPolygonVertex[] = definition.vertices.map(([xM, zM], index) => ({
      id: `${definition.key}-vertex-${index + 1}`,
      xM,
      zM,
    }));
    let design: StudioDesignV2 = {
      ...rectangular,
      schemaVersion: 2,
      id: `hmg-${definition.key}-design`,
      projectId,
      name: `${definition.name} interior concept`,
      geometryRevision: 1,
      room: {
        ...rectangular.room,
        ...roomIds(roomId),
        id: roomId,
        name: definition.roomType,
        length: definition.length,
        width: definition.width,
        perimeter,
      },
      objects: [],
      options: { A: { assignments: {} }, B: { assignments: {} } },
      camera: {
        position: [definition.length * 1.35, 6, definition.width * 1.45],
        target: [definition.length / 2, 1, definition.width / 2],
      },
    };
    for (const [index, [catalogId, xM, zM]] of definition.objects.entries()) {
      const next = addRoomObject(design, catalogId, { xM, zM });
      if (!next) throw new Error(`Invalid sample furniture placement: ${definition.name}/${catalogId}`);
      design = { ...next, objects: next.objects.map((item, itemIndex) => ({
        ...item,
        id: `${definition.key}-object-${itemIndex + 1}`,
      })) } as StudioDesignV2;
      if (index + 1 !== design.objects.length) throw new Error('Sample object placement order mismatch.');
    }
    return {
      name: definition.name,
      roomType: definition.roomType,
      brief: {
        room: definition.roomType,
        application: 'Interior floor and selected feature walls',
        quantity: '',
        priorities: ['Distinctive architectural geometry', 'Warm natural finish direction'],
      },
      design,
    };
  });
}
