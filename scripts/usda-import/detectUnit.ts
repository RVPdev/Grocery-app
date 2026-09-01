import type { Unit } from '../../src/domain/units/types';

type Rule = { pattern: RegExp; unit: Unit };

// Checked before MASS_RULES: "fl oz" / "fluid ounce" must be claimed as
// volume before the generic mass "oz" pattern below gets a chance to match.
// Patterns are anchored at the START of the candidate unit token (see
// extractCandidateToken below), with a trailing word boundary (`\b`) rather
// than a full `^...$` match. This lets a genuine unit word be followed by a
// trailing descriptive word with no separator (e.g. "oz bar", "cup chips")
// while still refusing to match a unit word buried inside a different
// leading word (e.g. "bag (7 oz)" starts with "bag", not a unit) or a
// look-alike word (`\b` after "oz" does not match "ozempic").
const VOLUME_RULES: Rule[] = [
  { pattern: /^cups?\b/i, unit: { kind: 'volume', symbol: 'cup' } },
  { pattern: /^(?:tablespoons?|tbsp)\b/i, unit: { kind: 'volume', symbol: 'tbsp' } },
  { pattern: /^(?:teaspoons?|tsp)\b/i, unit: { kind: 'volume', symbol: 'tsp' } },
  { pattern: /^(?:fluid\s+ounces?|fl\.?\s?oz)\b/i, unit: { kind: 'volume', symbol: 'floz' } },
  { pattern: /^(?:milliliters?|ml)\b/i, unit: { kind: 'volume', symbol: 'ml' } },
  { pattern: /^(?:liters?|l)\b/i, unit: { kind: 'volume', symbol: 'l' } },
];

const MASS_RULES: Rule[] = [
  { pattern: /^(?:kilograms?|kg)\b/i, unit: { kind: 'mass', symbol: 'kg' } },
  { pattern: /^(?:pounds?|lbs?)\b/i, unit: { kind: 'mass', symbol: 'lb' } },
  { pattern: /^(?:ounces?|oz)\b/i, unit: { kind: 'mass', symbol: 'oz' } },
  { pattern: /^(?:grams?|g)\b/i, unit: { kind: 'mass', symbol: 'g' } },
];

// The candidate unit token is the description with a leading numeric
// quantity stripped off. Unlike a naive substring search, the rule patterns
// above are anchored to the START of this candidate, so a unit word must be
// what the quantity is actually measured in (not a word appearing later in
// a parenthetical or descriptive clause) — while still tolerating a trailing
// descriptive word right after the unit (see the rules' `\b` anchors above).
function extractCandidateToken(text: string): string {
  return text.replace(/^[\d./\s]+/, '').trim();
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
