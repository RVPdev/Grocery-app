import type { Unit } from '../../src/domain/units/types';

type Rule = { pattern: RegExp; unit: Unit };

// Checked before MASS_RULES: "fl oz" / "fluid ounce" must be claimed as
// volume before the generic mass "oz" pattern below gets a chance to match
// the "oz" substring inside them.
const VOLUME_RULES: Rule[] = [
  { pattern: /\bcups?\b/i, unit: { kind: 'volume', symbol: 'cup' } },
  { pattern: /\btablespoons?\b|\btbsp\b/i, unit: { kind: 'volume', symbol: 'tbsp' } },
  { pattern: /\bteaspoons?\b|\btsp\b/i, unit: { kind: 'volume', symbol: 'tsp' } },
  { pattern: /\bfluid\s+ounces?\b|\bfl\.?\s?oz\b/i, unit: { kind: 'volume', symbol: 'floz' } },
  { pattern: /\bmilliliters?\b|\bml\b/i, unit: { kind: 'volume', symbol: 'ml' } },
  { pattern: /\bliters?\b|\bl\b/i, unit: { kind: 'volume', symbol: 'l' } },
];

const MASS_RULES: Rule[] = [
  { pattern: /\bkilograms?\b|\bkg\b/i, unit: { kind: 'mass', symbol: 'kg' } },
  { pattern: /\bpounds?\b|\blbs?\b/i, unit: { kind: 'mass', symbol: 'lb' } },
  { pattern: /\bounces?\b|\boz\b/i, unit: { kind: 'mass', symbol: 'oz' } },
  { pattern: /\bgrams?\b|\bg\b/i, unit: { kind: 'mass', symbol: 'g' } },
];

export function detectUnitFromText(rawText: string): Unit | null {
  const text = rawText.trim().toLowerCase();
  if (!text) return null;

  for (const rule of VOLUME_RULES) {
    if (rule.pattern.test(text)) return rule.unit;
  }
  for (const rule of MASS_RULES) {
    if (rule.pattern.test(text)) return rule.unit;
  }

  return { kind: 'count', label: text };
}
