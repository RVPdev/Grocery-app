import type { Unit } from '../../src/domain/units/types';

type Rule = { pattern: RegExp; unit: Unit };

// Checked before MASS_RULES: "fl oz" / "fluid ounce" must be claimed as
// volume before the generic mass "oz" pattern below gets a chance to match.
// Patterns are anchored (^...$) and tested against the candidate unit token
// (see extractCandidateToken below), not the whole free-text description —
// otherwise a unit word appearing anywhere in a parenthetical or trailing
// clause (e.g. "bag (7 oz)") would wrongly claim the entire description.
const VOLUME_RULES: Rule[] = [
  { pattern: /^cups?$/i, unit: { kind: 'volume', symbol: 'cup' } },
  { pattern: /^(?:tablespoons?|tbsp)$/i, unit: { kind: 'volume', symbol: 'tbsp' } },
  { pattern: /^(?:teaspoons?|tsp)$/i, unit: { kind: 'volume', symbol: 'tsp' } },
  { pattern: /^(?:fluid\s+ounces?|fl\.?\s?oz)$/i, unit: { kind: 'volume', symbol: 'floz' } },
  { pattern: /^(?:milliliters?|ml)$/i, unit: { kind: 'volume', symbol: 'ml' } },
  { pattern: /^(?:liters?|l)$/i, unit: { kind: 'volume', symbol: 'l' } },
];

const MASS_RULES: Rule[] = [
  { pattern: /^(?:kilograms?|kg)$/i, unit: { kind: 'mass', symbol: 'kg' } },
  { pattern: /^(?:pounds?|lbs?)$/i, unit: { kind: 'mass', symbol: 'lb' } },
  { pattern: /^(?:ounces?|oz)$/i, unit: { kind: 'mass', symbol: 'oz' } },
  { pattern: /^(?:grams?|g)$/i, unit: { kind: 'mass', symbol: 'g' } },
];

// The candidate unit token is the leading segment of the description (up to
// the first "(" or ",", whichever comes first), with a leading numeric
// quantity stripped off. This keeps unit detection scoped to what the
// quantity is actually measured in, rather than matching unit words that
// happen to appear later in a parenthetical or descriptive clause.
function extractCandidateToken(text: string): string {
  const parenIdx = text.indexOf('(');
  const commaIdx = text.indexOf(',');
  let cutIdx = text.length;
  if (parenIdx !== -1) cutIdx = Math.min(cutIdx, parenIdx);
  if (commaIdx !== -1) cutIdx = Math.min(cutIdx, commaIdx);
  const leadingSegment = text.slice(0, cutIdx);
  return leadingSegment.replace(/^[\d./\s]+/, '').trim();
}

export function detectUnitFromText(rawText: string): Unit | null {
  const text = rawText.trim().toLowerCase();
  if (!text) return null;

  const candidate = extractCandidateToken(text);

  for (const rule of VOLUME_RULES) {
    if (rule.pattern.test(candidate)) return rule.unit;
  }
  for (const rule of MASS_RULES) {
    if (rule.pattern.test(candidate)) return rule.unit;
  }

  return { kind: 'count', label: text };
}
