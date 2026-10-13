import type {StudioDesign, StudioAssignment} from './studio3d/types';
export interface CommandEnvelope { command: string; projectId?: string; expectedVersion?: number; idempotencyKey?: string; payload?: Record<string, unknown> }
export interface CommandResult<T = unknown> { ok: boolean; data?: T; version?: number; error?: {code: string; message: string; currentVersion?: number} }
export interface HmgOption {id: string; title: string; tone: string; movement: string; application: string; status: string; data: Record<string, unknown>}
export interface Question {id: string; text: string; answer?: string; status: string; owner?: string}
export interface Decision {id: string; action: string; actorId: string; at: string; version: number; reason?: string; optionId?: string}
export interface HmgBrief {room: string; application: string; quantity: string; unit: string; priorities: string[]; requirements: string; budget?: string; targetDate?: string}
export interface HmgConcept {id: string; name: string; scene: Record<string, unknown>; annotations?: unknown[]; optionId?: string; selectionVersion?: number}
export interface HmgStudioQuoteSource {kind:'studio';summaryId:string;designId:string;designRevision:number;geometryRevision:number;option:'A'|'B'}
export interface QuoteLine {source?:{assetId:string;surfaceId:string;title:string;sourcePageUrl:string};id: string; description: string; quantity: string; unit: string; allowancePct: string; rate: string; discountPct: string; taxPct: string; currency: string}
export interface QuoteTotals {billableQuantity: string; subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string}
export interface HmgQuote {source?:HmgStudioQuoteSource;id: string; projectId: string; revision: number; selectionVersion: number; inquiryRevisionId?: string; lines: QuoteLine[]; totals: QuoteTotals | null; pricingStatus: string; termsHash: string; currentness: string; assumptions: string[]; exclusions: string[]; approval?: {status: string; requesterId: string; reason: string; reviewerId?: string; note?: string; requestedAt?: string; reviewedAt?: string; reviewerRole?: string}; financials?: {costTotal: string; grossProfit: string; grossMarginPct: string}}

export type HmgPlanUploadStatus = 'Uploaded'|'Extracting'|'Needs Review'|'Ready for 3D'|'Failed';
export type HmgPlanRoomCategory = 'hall'|'kitchen'|'bedroom'|'toilet'|'sit_out'|'pooja'|'stair'|'other';
export type HmgPlanRoomConfidence = 'high'|'medium'|'low';
export type HmgPlanOpeningType = 'door'|'window'|'ventilator'|'main_door'|'unknown';
export interface HmgPlanExtractionRoom {id:string; label:string; category:HmgPlanRoomCategory; lengthFt:number|null; widthFt:number|null; heightFt:number|null; includeFloor:boolean; includeInteriorWalls:boolean; confidence:HmgPlanRoomConfidence; notes:string[]}
export interface HmgPlanExtractionDraft {sourceUploadId:string; model:string; generatedAt:string; buildingFacing?:'north'|'south'|'east'|'west'|'unknown'; builtUpAreaSqFt?:number; floorName:string; rooms:HmgPlanExtractionRoom[]; openings:Array<{label:string; type:HmgPlanOpeningType; notes?:string}>; warnings:string[]; rawTextPreview:string; extractionProof?:string}
export interface HmgReviewedPlanRoom {id:string; name:string; category:HmgPlanRoomCategory; lengthFt:number; widthFt:number; heightFt:number; includeFloor:boolean; includeInteriorWalls:boolean}
export interface HmgReviewedPlan {reviewedAt:string; reviewedBy:string; unit:'ft'; defaultHeightFt:number; rooms:HmgReviewedPlanRoom[]; assumptions:string[]}
export interface HmgPlanUpload {id:string; projectId:string; fileName:string; storageBucket:'hmg-project-plans'; storagePath:string; mimeType:string; sizeBytes:number; status:HmgPlanUploadStatus; extraction?:HmgPlanExtractionDraft; reviewed?:HmgReviewedPlan; generatedDesignIds:string[]; createdAt:string; updatedAt:string; createdBy:string; error?:{code:string; message:string}}

export interface HmgProject {planUploads?: HmgPlanUpload[]; stoneStudioDesigns?: HmgStudioSavedDesign[]; studioQuoteSummaries?: HmgStudioQuoteSummary[];alternatives?: Record<string,string>; evidence?: HmgEvidence[]; eligibility?: Record<string,HmgEligibility>; changes?: HmgChange[]; participants?: string[]; assignedConsultantId?: string | null; operationsId?: string | null; isDemo?: boolean; latestInquiryId?: string | null; latestProposalId?: string | null; id: string; name: string; ownerId: string; version: number; selectionVersion: number; stage: string; archived: boolean; brief: HmgBrief; shortlist: string[]; preferredOptionId: string | null; rejected: Record<string,string>; questions: Question[]; concepts: HmgConcept[]; timeline: Decision[]; inquiries: Array<{id: string; selectionVersion: number; at: string; status: string; currentness?: string}>; proposals: Array<{id: string; quote: HmgQuote; at: string; demoLabel: string; currentness?: string}>; unavailable: string[]; notes?: Array<{id:string; text:string}>; checks?: HmgEvidence[]; tasks?: Array<{id:string; title:string; status:string; ownerId:string}>; quote?: HmgQuote | null; quoteHistory?: HmgQuote[]}
export interface HmgContext {actorId: string; isStaff: boolean; canSales?: boolean; canApprove: boolean; canPrice?: boolean; canCreate?: boolean; isExecutive: boolean; demoLabel: string; limitations: string[]}
export interface HmgList<T> {data:T[];total:number;page:number;pageSize:number}

/** Mirrors backend SALES_STAGES; archive is a separate visibility flag. */
export const HMG_SALES_STAGES = [
  'Lead', 'Discovery', 'Consultation', 'Verification', 'Quotation',
  'Proposal', 'Negotiation', 'Won', 'Declined',
] as const;
export type HmgSalesStage = typeof HMG_SALES_STAGES[number];
export type HmgLeadContactChannel = 'Email' | 'Phone' | 'Showroom' | 'Referral' | 'Other';
export interface HmgLeadInput {
  name: string;
  brief: Partial<Omit<HmgBrief, 'unit'>> & {unit?: 'sq ft'};
  source: string;
  contactName?: string;
  contactChannel?: HmgLeadContactChannel | '';
  contactDetail?: string;
  notes?: string;
  salesOwnerId?: string;
}
/** Staff-only sales projection. Customer project views omit `sales` and `salesOwnerId`. */
export interface HmgSalesLead extends HmgProject {
  stage: HmgSalesStage;
  sales?: {
    source?: string;
    contactName?: string | null;
    contactChannel?: HmgLeadContactChannel | '' | null;
    contactDetail?: string | null;
    notes?: string | null;
    declineReason?: string;
    declinedAt?: string;
    decisionAt?: string;
  };
  salesOwnerId?: string | null;
}
export interface HmgSalesPipelineSummary extends HmgList<HmgSalesLead> {
  counts: Record<HmgSalesStage, number>;
}

export type HmgEvidenceStatus = 'Unknown' | 'Pending' | 'Verified' | 'Unsuitable' | 'Stale';
export interface HmgEvidence {
  id:string; label:string; status:HmgEvidenceStatus; source:string; scope:string; date:string;
  subjectType:'project'|'option'; optionId?:string; application:string; claim:string;
  unknowns:string[]; customerVisible:boolean; hardMismatch:boolean; selectionVersion:number;
  updatedAt:string; reviewerId:string;
}
export interface HmgEligibility {status:'Blocked'|'Unknown'|'Review needed'; reasons:string[]}
export interface HmgChange {
  id:string; kind:'unavailable'|'technical_mismatch'; optionId:string; reason:string;
  selectionVersion:number; createdAt:string; createdBy:string; status:'Open'|'Resolved';
  replacementOptionId?:string; resolvedAt?:string; resolutionReason?:string;
  successorSelectionVersion?:number; eligibleOptionIds?:string[];
}
export type HmgQuoteQueueStatus = 'all'|'draft'|'awaiting'|'ready'|'needs_revision';
export interface HmgQuoteQueueItem {
  id:string; projectId:string; projectName:string; projectVersion:number; ownerId:string; revision:number;
  selectionVersion:number; currentSelectionVersion:number; total:string|null; currency:'INR';
  pricingStatus:string; currentness:string; readinessStatus:'Technical checks pending'; deletable:boolean;
  queueStatus:Exclude<HmgQuoteQueueStatus,'all'>; updatedAt:string;
}
export interface HmgQuoteQueue extends HmgList<HmgQuoteQueueItem> {
  counts:Record<Exclude<HmgQuoteQueueStatus,'all'>,number>;
}
export interface HmgResetPreview {
  projectId:string; projectName:string; version:number; baselineVersion:number; previewToken:string;
  counts:{questions:number; concepts:number; notes:number; checks:number; tasks:number; inquiriesRetained:number; proposalsRetained:number; quoteRevisionsRetained:number};
  summary:string;
}
export interface HmgEvidenceInput {
  id?:string; label:string; status:HmgEvidenceStatus; source:string; scope:string; date:string;
  subjectType:'project'|'option'; optionId?:string; application:string; claim:string;
  unknowns:string[]; customerVisible:boolean; hardMismatch:boolean;
}

export interface HmgAiFindings {
  projectId: string;
  projectVersion: number;
  status: 'ready' | 'unavailable';
  summary: string;
  findings: Array<{claim: string; evidenceIds: string[]; severity: 'info' | 'review' | 'warning'; uncertainty: string}>;
  model: string;
  generatedAt: string;
  selectionVersion: number;
  disclaimer: string;
}

export interface HmgStudioSavedDesign {design: StudioDesign; revision: number; updatedAt: string}
export interface HmgStudioQuoteSummary {id:string; projectId:string; room:{name:string;length:number;width:number;height:number;unit:'m'|'ft'}; designId:string; designRevision:number; geometryRevision:number; option:'A'|'B'; at:string; status:'Unpriced preliminary summary'; lines:Array<{surfaceId:string; name:string; areaM2:string; assetId:string|null; assignment:StudioAssignment|null}>; totalAreaM2:string; assumptions:string[]; exclusions:string[]}

export interface HmgQuoteCandidate {projectId:string;projectName:string;projectVersion:number;kind:'studio'|'selection';summaryId?:string;designName?:string;option?:'A'|'B';designRevision?:number;hasQuote:boolean}
export interface HmgDesignDashboardRow {projectId:string;projectName:string;designCount:number;summaryCount:number;hasQuote:boolean;quoteStatus:string|null;updatedAt:string}
export interface HmgDesignDashboard extends HmgList<HmgDesignDashboardRow> {counts:{projects:number;designs:number;summaries:number;quotes:number}}

