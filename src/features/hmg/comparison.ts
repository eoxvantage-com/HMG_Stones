import type { HmgOption, HmgProject } from "./types";
export function comparisonFacts(
  project: HmgProject,
  option: HmgOption | undefined,
  id: string
) {
  return {
    Tone: option?.tone || "Unknown",
    Movement: option?.movement || "Unknown",
    "Application direction": option?.application || "Unknown",
    "Technical eligibility": project.eligibility?.[id]?.status || "Unknown",
    "Evidence blockers":
      project.eligibility?.[id]?.reasons.join("; ") || "Verification pending",
    Availability: project.unavailable.includes(id)
      ? "Unavailable"
      : "Not confirmed",
    "Care, exact slab and measured area": "Not confirmed",
    "Fit with brief": "Appearance preference only",
  };
}
export function differingFacts(facts: Record<string, string>[]) {
  return Object.keys(facts[0] || {}).filter(
    (key) => new Set(facts.map((f) => f[key])).size > 1
  );
}
