const FEET_INCHES = /^\s*(\d{1,3})\s*'\s*(?:-\s*([^\"]*))?\"?\s*$/;
const MAX_REASONABLE_FEET = 100;

function parseInches(raw: string | undefined): number | null {
  const value = (raw ?? "0").trim();
  if (!value) return 0;
  const mixed = value.match(/^(\d{1,2})\s+(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (mixed) {
    const inches = Number(mixed[1]), numerator = Number(mixed[2]), denominator = Number(mixed[3]);
    if (!denominator || inches >= 12 || numerator >= denominator) return null;
    return inches + numerator / denominator;
  }
  const fraction = value.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (fraction) {
    const numerator = Number(fraction[1]), denominator = Number(fraction[2]);
    if (!denominator || numerator >= denominator) return null;
    return numerator / denominator;
  }
  const compactHalf = value.match(/^(\d{1,2})12$/);
  if (compactHalf) {
    const inches = Number(compactHalf[1]);
    return inches < 12 ? inches + 0.5 : null;
  }
  if (/^\d{1,2}(?:\.\d{1,3})?$/.test(value)) {
    const inches = Number(value);
    return inches < 12 ? inches : null;
  }
  return null;
}

export function parseFeetInches(value: string): number | null {
  const match = value.match(FEET_INCHES);
  if (!match) return null;
  const feet = Number(match[1]);
  if (!Number.isFinite(feet) || feet > MAX_REASONABLE_FEET) return null;
  const inches = parseInches(match[2]);
  if (inches === null) return null;
  return feet + inches / 12;
}

export function feetToMeters(value: number): number {
  return Number((value * 0.3048).toFixed(4));
}
