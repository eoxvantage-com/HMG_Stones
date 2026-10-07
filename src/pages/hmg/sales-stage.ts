import { HMG_SALES_STAGES, type HmgProject, type HmgSalesLead, type HmgSalesStage } from "../../features/hmg/types";

const activeStages = HMG_SALES_STAGES.slice(0, -2);
type SalesMarkedProject = Pick<HmgProject, "stage"> & Partial<Pick<HmgSalesLead, "sales" | "salesOwnerId" | "quote" | "proposals">>;

/** Mirrors commands.py:sales_project; legacy projects keep the legacy stage command. */
export function isSalesPipelineProject(project: SalesMarkedProject): boolean {
  const ownerMarker = Object.prototype.hasOwnProperty.call(project, "salesOwnerId");
  const salesMarker = typeof project.sales === "object" && project.sales !== null && !Array.isArray(project.sales);
  return ownerMarker || salesMarker || ["Lead", "Proposal", "Negotiation", "Won", "Declined"].includes(project.stage);
}

/** Keep legacy project stage edits on their original workflow command. */
export function salesStageCommand(project: SalesMarkedProject): "transitionSalesStage" | "updateSalesStage" {
  return isSalesPipelineProject(project) ? "transitionSalesStage" : "updateSalesStage";
}

/** Matches change_sales_stage: one-step forward, any earlier active stage, and Declined. */
export function permittedSalesStageMoves(stage: string, currentProposal: boolean): HmgSalesStage[] {
  const index = activeStages.indexOf(stage as (typeof activeStages)[number]);
  if (index < 0) return [];
  const moves = activeStages.slice(0, index) as HmgSalesStage[];
  const next = activeStages[index + 1] as HmgSalesStage | undefined;
  if (next) moves.push(next);
  const valid = moves.filter((candidate) => currentProposal || !["Proposal", "Negotiation"].includes(candidate));
  if (stage === "Negotiation" && currentProposal) valid.push("Won");
  valid.push("Declined");
  return valid;
}

export function hasCurrentProposal(project: SalesMarkedProject): boolean {
  const quote = project.quote;
  return !!quote?.termsHash && quote.currentness === "Current" && (project.proposals || []).some((proposal) =>
    proposal.quote.termsHash === quote.termsHash && proposal.quote.selectionVersion === quote.selectionVersion
  );
}

export const normalizedPage = (value: string | null) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
};
