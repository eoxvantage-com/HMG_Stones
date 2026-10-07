export type StudioCamera={position:[number,number,number];target:[number,number,number]};
export type StudioAssignment={assetId:string;rotation:0|90;mode:'surface'|'tile'|'slab';widthM:number;heightM:number;groutMm:number;groutColor:string;dimensionsAssumed:boolean};
export type StudioPolygonVertex={id:string;xM:number;zM:number};
export type StudioRoomV1={id:string;name:string;length:number;width:number;height:number;unit:'m'|'ft';cornerIds:[string,string,string,string];wallIds:[string,string,string,string];wallSideIds:[string,string,string,string]};
/** V2 keeps the v1 rectangular metadata during migration; `perimeter` is the polygon geometry source. */
export type StudioRoomV2=StudioRoomV1&{perimeter:StudioPolygonVertex[]};
/** Shared room view keeps legacy consumers type-compatible during the staged v2 migration. */
export type StudioRoom=StudioRoomV1&{perimeter?:StudioPolygonVertex[]};
type StudioDesignBase={id:string;projectId:string;name:string;geometryRevision:number;objects:StudioRoomObject[];activeOption:'A'|'B';options:{A:{assignments:Record<string,StudioAssignment>};B:{assignments:Record<string,StudioAssignment>}};camera:StudioCamera};
export type StudioDesignV1=StudioDesignBase&{schemaVersion:1;room:StudioRoomV1};
export type StudioDesignV2=StudioDesignBase&{schemaVersion:2;room:StudioRoomV2};
/** Discriminated persisted design contract; use StudioDesignCompatibility only at untrusted migration boundaries. */
export type StudioDesign=StudioDesignV1|StudioDesignV2;
/** Legacy bridge for existing rectangle-first operations while their v2 overloads are implemented. */
export type StudioDesignCompatibility=StudioDesignBase&{schemaVersion:1|2;room:StudioRoom};
export type StudioSurface={id:string;name:string;width:number;height:number;area:number;kind:'floor'|'wall'};
export type StudioRoomObjectKind='sofa'|'armchair'|'chair'|'office-chair'|'coffee-table'|'side-table'|'bedside-table'|'desk'|'meeting-table'|'bed'|'wardrobe'|'dresser'|'bookshelf'|'floor-lamp'|'table-lamp';
export type StudioRoomFinish='light-oak'|'walnut'|'white'|'linen'|'charcoal'|'olive'|'brass';
/** Catalog-backed procedural furniture. No external model paths or user-supplied geometry. */
export type StudioRoomObject={id:string;catalogId:string;kind:StudioRoomObjectKind;xM:number;zM:number;rotationDeg:0|90|180|270;finish:StudioRoomFinish};
