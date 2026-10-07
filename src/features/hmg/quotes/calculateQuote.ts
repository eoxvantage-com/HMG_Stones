import Decimal from "decimal.js";
import type { QuoteLine, QuoteTotals } from "../types";
const money = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
/** Advisory preview only. Persisted totals and approval authority are server-calculated. */
export function calculatePreview(lines: QuoteLine[]): QuoteTotals | null {
  if (
    !lines.length ||
    lines.length > 30 ||
    new Set(lines.map((l) => l.currency)).size !== 1 ||
    new Set(lines.map((l) => l.unit)).size !== 1
  )
    return null;
  try {
    let quantity = new Decimal(0),
      subtotal = new Decimal(0),
      discount = new Decimal(0),
      tax = new Decimal(0);
    for (const l of lines) {
      if (l.currency !== "INR" || !["sq ft", "m\u00b2"].includes(l.unit))
        return null;
      const values = [
        l.quantity,
        l.rate,
        l.allowancePct,
        l.discountPct,
        l.taxPct,
      ];
      if (
        !l.description.trim() ||
        l.description.trim().length > 500 ||
        values.some((v) => !/^\d+(\.\d+)?$/.test(v))
      )
        return null;
      const [q, rate, a, d, t] = values.map((v) => new Decimal(v));
      if (
        q.gt(1000000) ||
        rate.gt(10000000) ||
        a.gt(50) ||
        d.gt(30) ||
        t.gt(30)
      )
        return null;
      const billable = money(q.mul(a.div(100).add(1)));
      const lineSub = money(billable.mul(rate));
      const lineDisc = money(lineSub.mul(d).div(100));
      quantity = quantity.add(billable);
      subtotal = subtotal.add(lineSub);
      discount = discount.add(lineDisc);
      tax = tax.add(money(lineSub.sub(lineDisc).mul(t).div(100)));
    }
    const taxable = subtotal.sub(discount);
    return {
      billableQuantity: quantity.toFixed(2),
      subtotal: subtotal.toFixed(2),
      discountAmount: discount.toFixed(2),
      taxableAmount: taxable.toFixed(2),
      taxAmount: tax.toFixed(2),
      total: taxable.add(tax).toFixed(2),
    };
  } catch {
    return null;
  }
}
