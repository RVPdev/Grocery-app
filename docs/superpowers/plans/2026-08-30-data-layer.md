# Macro Recipe App — Plan 2: Data Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two persistence stores the domain layer needs but does not implement itself: a read-only bundled USDA nutrition database (built by a one-time import script, queried at runtime), and a JSON-file store for user-created recipes.

**Architecture:** Two independent halves.
1. `scripts/usda-import/` — a Node-only, build-time pipeline (never shipped in the app) that downloads real USDA FoodData Central CSVs, maps them onto the domain's `Ingredient`/`Portion`/`Unit` shapes, and writes `assets/usda.db`, a plain SQLite file bundled into the app.
2. `src/data/` — the runtime code the app actually ships. `src/data/usda/` reads the bundled database via `expo-sqlite`. `src/data/store/` reads and writes the user's recipes as a single JSON file via `expo-file-system`, behind a small `FileIO` interface so the read/write logic is testable without any native module at all.

**Tech Stack:** Node's built-in `node:sqlite` (import script only) · `csv-parse` (import script only) · `expo-sqlite` · `expo-asset` · `expo-file-system` · Jest (`jest-expo` preset, already configured)

**Spec:** `docs/superpowers/specs/2026-08-29-macro-recipe-app-design.md` (sections 7 and 11 are the primary source for this plan)

## Global Constraints

- **Nothing under `src/domain/` may import `react`, `react-native`, `expo`, or any `expo-*` package.** This plan does not touch `src/domain/`, but every function it writes elsewhere imports *from* domain types and must not introduce a reverse dependency.
- **All quantities are stored in grams.** `Portion.gramsPerUnit` computed by this plan's import script must be grams-per-one-unit, never a raw USDA `gram_weight` for a multi-unit portion.
- **Nutrition is always per 100 g**, field name `nutritionPer100g`.
- **Expected failures return `Result`; only genuine emergencies throw.** This plan's `RecipeRepository` interface (per spec section 7) returns plain `Promise`s with no `Result` wrapper — disk/database failure here is a genuine emergency (corrupted bundled data, full disk), not an expected outcome a caller should branch on.
- **Ratio-based volume conversion, never absolute-ml-and-density.** This plan does not do unit conversion itself (that's `toGrams` in `src/domain/units/convert.ts`, already built) — it only detects which `Unit` a USDA portion describes, which `toGrams` then uses.
- **Node 26 / npm.** No bun, pnpm, or yarn on this machine.
- **Every relative *value* import between files under `scripts/usda-import/*.ts` needs an explicit `.ts` extension** (e.g. `from './parseCsv.ts'`, not `from './parseCsv'`) — confirmed empirically: Node's native TypeScript execution (`node file.ts`) requires it for ESM resolution, while Jest does not, so a missing extension silently passes every test and only fails when a script is actually run directly with `node`. `import type` statements are erased before resolution and are exempt. This does not apply to `src/domain/` or `src/data/`, which never run under plain `node`.
- **Ids are permanent.** USDA ingredients use `usda:<fdcId>`; this plan generates that id at import time and never changes it.
- **USDA FoodData Central data is public domain (CC0 1.0)**, confirmed during research for this plan. USDA requests — does not require — attribution as "FoodData Central." This plan's import script includes that attribution as a code comment; no licence blocker exists.

## Decision: bundling SR Legacy, with free-text portion parsing

The design spec assumed "SR Legacy, ~7,800 foods." That part checked out — **SR Legacy has exactly 7,793 foods**, confirmed directly against USDA's own `all_downloaded_table_record_counts.csv`, which ships inside the download itself. It's a frozen, long-stable dataset (last updated April 2018 and not expected to change), so unlike a rolling dataset, the exact download filename and food count in this plan won't drift.

What the spec's authors couldn't have known without downloading the real data: **every single one of SR Legacy's 14,449 `food_portion` rows has `measure_unit_id = 9999`** ("undetermined") — confirmed by scanning every distinct value that column actually takes across the whole file. USDA ships a `measure_unit.csv` lookup table with 122 real entries (`cup`, `tablespoon`, `medium`, `slice`, ...), but for SR Legacy, no `food_portion` row ever references any of them. The structured join the spec implicitly assumed (`food_portion.measure_unit_id` → `measure_unit.id` → a unit name) simply returns nothing, for every food, always.

The actual unit information for SR Legacy lives only as free text, in two columns: `food_portion.modifier` (e.g. `"1 cup"`) and `food_portion.portion_description`. This plan's import pipeline detects units by pattern-matching that text directly, instead of joining through `measure_unit_id`. Measured against the real, full dataset (methodology and code in Task 2 and Task 6):

- **96.6%** of foods (7,526 / 7,793) get at least one portion whose unit this pipeline can determine (volume or count-style).
- **42.3%** of foods (3,299 / 7,793) get a **volume** portion specifically — the unit kind the domain's `toGrams` volume branch needs.
- The remaining **54.2%** (4,227 / 7,793) get only count-style portions (e.g. `"medium"`, `"1 slice"`) — still usable by `toGrams`'s count branch, but only when a recipe's ingredient entry uses the exact same label.

Flag the 42.3% figure to whoever designs Plan 3's ingredient-search UX: fewer than half of foods support volume entry ("2 cups of X"), so the `NO_PORTION_DATA` manual-entry prompt (spec section 8) will be a common path for volume-style input, not a rare fallback.

**Foundation Foods** — USDA's newer dataset, which *does* populate `measure_unit_id` correctly — remains a reasonable follow-up if SR Legacy's free-text-derived portions prove too noisy or its 7,793 foods too few in practice. Adding it later means extending `detectUnitFromText`'s caller to try a structured `measure_unit_id` join first (when the food's source data has one) before falling back to free-text parsing, which this plan's `assemblePortions` (Task 4) does not need today because SR Legacy alone never has one — not a rewrite, an addition.

---

### Task 1: Import tooling scaffold — verify the environment, install tooling, get real data

**Files:**
- Create: `scripts/usda-import/` (directory)
- Create: `scripts/usda-import/.gitignore`
- Modify: `package.json` (add `csv-parse` devDependency)

**Interfaces:**
- Consumes: nothing
- Produces: a real, unzipped SR Legacy CSV dataset on disk for every later task in this plan to read

- [ ] **Step 1: Confirm Node can run TypeScript directly**

```bash
node --version
node --experimental-strip-types -e "const x: number = 1; console.log(x)"
```

Expected: the second command prints `1` with no error. If it errors that the flag is unrecognized, Node's built-in TypeScript support isn't available on this machine's Node version — stop and report this to your human partner rather than installing `ts-node`/`tsx` unprompted, since that changes the plan's tooling assumption.

If the flag works, note whether it is required on every invocation (some Node versions enable stripping by default and reject the flag as unnecessary — try the command without the flag too, and use whichever form succeeds for all later `node scripts/usda-import/*.ts` commands in this plan).

- [ ] **Step 2: Confirm `node:sqlite` is available**

```bash
node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE t (x INTEGER)'); console.log('node:sqlite OK');"
```

Expected: prints `node:sqlite OK`. If it throws that `node:sqlite` is experimental and needs a flag, add `--experimental-sqlite` to every later `node` invocation that touches `node:sqlite` in this plan (Tasks 7 and 8).

- [ ] **Step 3: Install the CSV parser**

```bash
npm install --save-dev csv-parse
```

This is the one new dependency this plan adds. It is used only by the Node import script (never bundled into the app) and handles quoted fields safely (food descriptions contain commas), which a hand-written CSV splitter would get wrong.

- [ ] **Step 4: Create the import script directory and its own gitignore**

```bash
mkdir -p scripts/usda-import/.data
```

Create `scripts/usda-import/.gitignore`:

```
.data/
```

The raw downloaded USDA CSVs are regenerable from a public URL and are tens of megabytes — they don't belong in git. Only the *output* of this pipeline (`assets/usda.db`) gets committed, in Task 8.

- [ ] **Step 5: Download the SR Legacy dataset**

SR Legacy is a frozen dataset (last published April 2018), so unlike a rolling release, its exact filename is stable and doesn't need to be discovered dynamically:

```bash
curl -s -o scripts/usda-import/.data/sr-legacy.zip \
  "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
unzip -l scripts/usda-import/.data/sr-legacy.zip
```

Expected: a zip listing including `food.csv`, `nutrient.csv`, `food_nutrient.csv`, `food_portion.csv`, `measure_unit.csv`, and `all_downloaded_table_record_counts.csv`, all inside one top-level folder (`FoodData_Central_sr_legacy_food_csv_2018-04/`).

**If this URL 404s** (USDA occasionally reorganizes file paths even for frozen datasets), fall back to discovering the current link:

```bash
curl -s https://fdc.nal.usda.gov/download-datasets/ | grep -o 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_[^"]*\.zip' | head -1
```

and use the printed URL in place of the one above.

- [ ] **Step 6: Unzip and confirm real column headers**

```bash
unzip -o scripts/usda-import/.data/sr-legacy.zip -d scripts/usda-import/.data/
DATA_DIR=scripts/usda-import/.data/FoodData_Central_sr_legacy_food_csv_2018-04
cat "$DATA_DIR/all_downloaded_table_record_counts.csv"
head -1 "$DATA_DIR/food.csv"
head -1 "$DATA_DIR/nutrient.csv"
head -1 "$DATA_DIR/food_nutrient.csv"
head -1 "$DATA_DIR/food_portion.csv"
```

Expected record counts (confirmed real values — this dataset doesn't change, so these exact numbers should reproduce):

```
"food","7793"
"food_nutrient","644125"
"food_portion","14449"
```

Expected headers:
- `food.csv`: `fdc_id,data_type,description,food_category_id,publication_date`
- `nutrient.csv`: `id,name,unit_name,nutrient_nbr,rank`
- `food_nutrient.csv`: `id,fdc_id,nutrient_id,amount,data_points,derivation_id,min,max,median,footnote,min_year_acquired`
- `food_portion.csv`: `id,fdc_id,seq_num,amount,measure_unit_id,portion_description,modifier,gram_weight,data_points,footnote,min_year_acquired`

**If any header or count differs from this list**, the download doesn't match what this plan was verified against — stop and re-confirm before continuing, since Tasks 2–8's code depends on these exact column names.

- [ ] **Step 7: Record the dataset location for later tasks**

The path is now fixed: `scripts/usda-import/.data/FoodData_Central_sr_legacy_food_csv_2018-04`. Every later task in this plan refers to it as `<DATA_DIR>`.

- [ ] **Step 8: Commit the scaffold**

```bash
git add scripts/usda-import/.gitignore package.json package-lock.json
git commit -m "chore: scaffold USDA import tooling and download SR Legacy dataset"
```

(The downloaded CSVs themselves are gitignored and not part of this commit.)

---

### Task 2: Detect a `Unit` from USDA's free-text portion description

**Files:**
- Create: `scripts/usda-import/detectUnit.ts`
- Test: `scripts/usda-import/detectUnit.test.ts`

**Interfaces:**
- Consumes: `Unit` (`src/domain/units/types.ts`, already built in Plan 1)
- Produces: `detectUnitFromText(text: string): Unit | null`

SR Legacy's `food_portion.measure_unit_id` is always the placeholder `9999` (confirmed in Task 1) — there is no structured field to join against. The only place unit information exists is free text in `modifier` and `portion_description` (e.g. `"1 cup"`, `"3 oz"`, `"1 medium"`). This function is a small rule engine over that text: check for a mass word, then a volume word, and if neither matches, treat the whole text as a `count` label — which is exactly what a phrase like `"medium"` or `"1 slice, cooked"` already is.

- [ ] **Step 1: Write the failing test**

Create `scripts/usda-import/detectUnit.test.ts`:

```ts
import { detectUnitFromText } from './detectUnit';

describe('detectUnitFromText', () => {
  it('detects a volume unit', () => {
    expect(detectUnitFromText('1 cup')).toEqual({ kind: 'volume', symbol: 'cup' });
  });

  it('detects tablespoon by its abbreviation', () => {
    expect(detectUnitFromText('2 tbsp')).toEqual({ kind: 'volume', symbol: 'tbsp' });
  });

  it('detects a mass unit', () => {
    expect(detectUnitFromText('3 oz')).toEqual({ kind: 'mass', symbol: 'oz' });
  });

  it('does not mistake "fl oz" (volume) for "oz" (mass)', () => {
    expect(detectUnitFromText('1 fl oz')).toEqual({ kind: 'volume', symbol: 'floz' });
  });

  it('falls back to a count label for descriptive text', () => {
    expect(detectUnitFromText('1 medium')).toEqual({ kind: 'count', label: '1 medium' });
  });

  it('returns null for empty text', () => {
    expect(detectUnitFromText('')).toBeNull();
    expect(detectUnitFromText('   ')).toBeNull();
  });
});
```

The `"fl oz"` test is the important one: `"oz"` alone is a substring of `"fl oz"`, so a naive mass-first check would misclassify a fluid-ounce volume measurement as a weight measurement. Order matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest scripts/usda-import/detectUnit.test.ts`
Expected: FAIL — `Cannot find module './detectUnit'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/usda-import/detectUnit.ts`:

```ts
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
```

Mass conversion doesn't strictly need portion data at all (Plan 1's `toGrams` handles any mass unit for any ingredient without one), but detecting mass-flavoured text here still matters — without it, something like `"3 oz"` would fall through to become a `count` unit labelled `"3 oz"`, which is a meaningless "count" of a thing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest scripts/usda-import/detectUnit.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/usda-import/detectUnit.ts scripts/usda-import/detectUnit.test.ts
git commit -m "feat(usda-import): detect a Unit from USDA's free-text portion description"
```

---

### Task 3: Extract macro nutrition from USDA nutrient rows

**Files:**
- Create: `scripts/usda-import/types.ts`
- Create: `scripts/usda-import/extractNutrition.ts`
- Test: `scripts/usda-import/extractNutrition.test.ts`

**Interfaces:**
- Consumes: `Nutrition` (`src/domain/ingredients/types.ts`)
- Produces: `FoodRow`, `NutrientRow`, `FoodNutrientRow`, `FoodPortionRow` (raw CSV row shapes); `buildNutrientIdMap(nutrients): Map<string, keyof Nutrition>`; `extractNutrition(rows, nutrientIdMap): Nutrition`

- [ ] **Step 1: Write the failing test**

Create `scripts/usda-import/types.ts`:

```ts
export type FoodRow = {
  fdc_id: string;
  description: string;
  data_type: string;
};

export type NutrientRow = {
  id: string;
  name: string;
  unit_name: string;
  nutrient_nbr: string;
};

export type FoodNutrientRow = {
  fdc_id: string;
  nutrient_id: string;
  amount: string;
};

export type FoodPortionRow = {
  fdc_id: string;
  amount: string;
  // Always "9999" ("undetermined") for SR Legacy — real unit information
  // lives only in modifier/portion_description. Kept here because it's a
  // real column in the source file, even though this plan's code never
  // reads it.
  measure_unit_id: string;
  portion_description: string;
  modifier: string;
  gram_weight: string;
};
```

Every field is a string because that's what `csv-parse` produces — numeric parsing happens explicitly wherever a value is used, never implicitly.

Create `scripts/usda-import/extractNutrition.test.ts`:

```ts
import { buildNutrientIdMap, extractNutrition } from './extractNutrition';
import type { NutrientRow, FoodNutrientRow } from './types';

const nutrients: NutrientRow[] = [
  { id: '1008', name: 'Energy', unit_name: 'KCAL', nutrient_nbr: '208' },
  { id: '1003', name: 'Protein', unit_name: 'G', nutrient_nbr: '203' },
  { id: '1004', name: 'Total lipid (fat)', unit_name: 'G', nutrient_nbr: '204' },
  { id: '1005', name: 'Carbohydrate, by difference', unit_name: 'G', nutrient_nbr: '205' },
  { id: '1087', name: 'Calcium, Ca', unit_name: 'MG', nutrient_nbr: '301' },
];

describe('buildNutrientIdMap', () => {
  it('maps only the four macro nutrient ids we care about', () => {
    const map = buildNutrientIdMap(nutrients);
    expect(map.get('1008')).toBe('kcal');
    expect(map.get('1003')).toBe('proteinG');
    expect(map.get('1004')).toBe('fatG');
    expect(map.get('1005')).toBe('carbsG');
    expect(map.has('1087')).toBe(false);
  });
});

describe('extractNutrition', () => {
  const nutrientIdMap = buildNutrientIdMap(nutrients);

  it('extracts all four macros for a food', () => {
    const rows: FoodNutrientRow[] = [
      { fdc_id: '1', nutrient_id: '1008', amount: '389' },
      { fdc_id: '1', nutrient_id: '1003', amount: '16.9' },
      { fdc_id: '1', nutrient_id: '1004', amount: '6.9' },
      { fdc_id: '1', nutrient_id: '1005', amount: '66.3' },
      { fdc_id: '1', nutrient_id: '1087', amount: '54' },
    ];
    expect(extractNutrition(rows, nutrientIdMap)).toEqual({
      kcal: 389, proteinG: 16.9, fatG: 6.9, carbsG: 66.3,
    });
  });

  it('defaults missing macros to zero', () => {
    const rows: FoodNutrientRow[] = [{ fdc_id: '1', nutrient_id: '1008', amount: '52' }];
    expect(extractNutrition(rows, nutrientIdMap)).toEqual({
      kcal: 52, proteinG: 0, fatG: 0, carbsG: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest scripts/usda-import/extractNutrition.test.ts`
Expected: FAIL — `Cannot find module './extractNutrition'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/usda-import/extractNutrition.ts`:

```ts
import type { Nutrition } from '../../src/domain/ingredients/types';
import type { FoodNutrientRow, NutrientRow } from './types';

const NUTRIENT_NBR: Record<keyof Nutrition, string> = {
  kcal: '208',
  proteinG: '203',
  fatG: '204',
  carbsG: '205',
};

export function buildNutrientIdMap(nutrients: NutrientRow[]): Map<string, keyof Nutrition> {
  const map = new Map<string, keyof Nutrition>();
  for (const nutrient of nutrients) {
    for (const [field, nbr] of Object.entries(NUTRIENT_NBR) as [keyof Nutrition, string][]) {
      if (nutrient.nutrient_nbr === nbr) {
        map.set(nutrient.id, field);
      }
    }
  }
  return map;
}

export function extractNutrition(
  foodNutrientRows: FoodNutrientRow[],
  nutrientIdMap: Map<string, keyof Nutrition>,
): Nutrition {
  const result: Nutrition = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const row of foodNutrientRows) {
    const field = nutrientIdMap.get(row.nutrient_id);
    if (field) {
      result[field] = parseFloat(row.amount) || 0;
    }
  }
  return result;
}
```

`nutrient.id` (the internal primary key `food_nutrient.nutrient_id` actually joins against — confirmed real values `1008`/`1003`/`1004`/`1005` for energy/protein/fat/carbohydrate in the SR Legacy download, not the same as the numbers below) can differ between USDA dataset snapshots — only `nutrient_nbr` (`"208"` for energy, etc.) is the stable public code. That's why this resolves through `nutrient_nbr` once per import run instead of hardcoding `nutrient.id` values directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest scripts/usda-import/extractNutrition.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/usda-import/types.ts scripts/usda-import/extractNutrition.ts scripts/usda-import/extractNutrition.test.ts
git commit -m "feat(usda-import): extract macro nutrition from USDA nutrient rows"
```

---

### Task 4: Assemble portions from USDA food_portion rows

**Files:**
- Create: `scripts/usda-import/assemblePortions.ts`
- Test: `scripts/usda-import/assemblePortions.test.ts`

**Interfaces:**
- Consumes: `Portion` (`src/domain/ingredients/types.ts`); `detectUnitFromText` (Task 2); `FoodPortionRow` (Task 3)
- Produces: `assemblePortions(portionRows): Portion[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/usda-import/assemblePortions.test.ts`:

```ts
import { assemblePortions } from './assemblePortions';
import type { FoodPortionRow } from './types';

describe('assemblePortions', () => {
  it('converts a cup portion into grams-per-one-unit', () => {
    // 1 cup weighs 80 g -> gramsPerUnit is 80 / 1
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '1 cup', modifier: '', gram_weight: '80' },
    ];
    expect(assemblePortions(rows)).toEqual([
      { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 },
    ]);
  });

  it('divides gram_weight by amount when amount is not 1', () => {
    // 3 tsp weighs 12 g total -> 4 g per tsp
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '3', measure_unit_id: '9999', portion_description: '3 tsp', modifier: '', gram_weight: '12' },
    ];
    expect(assemblePortions(rows)[0].gramsPerUnit).toBeCloseTo(4, 6);
  });

  it('prefers portion_description as the label, falling back to modifier', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '', modifier: '1 medium', gram_weight: '110' },
    ];
    expect(assemblePortions(rows)[0].label).toBe('1 medium');
  });

  it('produces a count unit when the text has no recognisable mass or volume word', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '1 medium', modifier: '', gram_weight: '110' },
    ];
    expect(assemblePortions(rows)[0].unit).toEqual({ kind: 'count', label: '1 medium' });
  });

  it('skips a portion with no descriptive text at all', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '', modifier: '', gram_weight: '50' },
    ];
    expect(assemblePortions(rows)).toEqual([]);
  });

  it('skips a portion with a zero or invalid amount', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '0', measure_unit_id: '9999', portion_description: '1 cup', modifier: '', gram_weight: '50' },
    ];
    expect(assemblePortions(rows)).toEqual([]);
  });

  it('skips a portion with a zero or invalid gram_weight', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '1 cup', modifier: '', gram_weight: '0' },
    ];
    expect(assemblePortions(rows)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest scripts/usda-import/assemblePortions.test.ts`
Expected: FAIL — `Cannot find module './assemblePortions'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/usda-import/assemblePortions.ts`:

```ts
import type { Portion } from '../../src/domain/ingredients/types';
import { detectUnitFromText } from './detectUnit.ts';
import type { FoodPortionRow } from './types';

export function assemblePortions(portionRows: FoodPortionRow[]): Portion[] {
  const portions: Portion[] = [];

  for (const row of portionRows) {
    const amount = parseFloat(row.amount);
    const gramWeight = parseFloat(row.gram_weight);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(gramWeight) || gramWeight <= 0) {
      continue;
    }

    const label = row.portion_description.trim() || row.modifier.trim();
    const text = `${row.modifier} ${row.portion_description}`.trim();
    const unit = detectUnitFromText(text);
    if (!unit) continue;

    portions.push({ label, unit, gramsPerUnit: gramWeight / amount });
  }

  return portions;
}
```

USDA's `food_portion.amount` is "how many measure units this row describes" (`amount: 3` for "3 tsp"), and `gram_weight` is the weight of that *whole* described portion — not one unit. Dividing by `amount` is what turns it into the domain's `gramsPerUnit` (weight of exactly one unit), which is what `toGrams` (Plan 1) expects.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest scripts/usda-import/assemblePortions.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/usda-import/assemblePortions.ts scripts/usda-import/assemblePortions.test.ts
git commit -m "feat(usda-import): assemble portions from USDA food_portion rows"
```

---

### Task 5: Load the full USDA CSV dataset into `Ingredient[]`

**Files:**
- Create: `scripts/usda-import/parseCsv.ts`
- Create: `scripts/usda-import/loadSrLegacyFoods.ts`
- Create: `scripts/usda-import/__fixtures__/mini-dataset/food.csv`
- Create: `scripts/usda-import/__fixtures__/mini-dataset/nutrient.csv`
- Create: `scripts/usda-import/__fixtures__/mini-dataset/food_nutrient.csv`
- Create: `scripts/usda-import/__fixtures__/mini-dataset/food_portion.csv`
- Test: `scripts/usda-import/loadSrLegacyFoods.test.ts`

**Interfaces:**
- Consumes: `Ingredient` (`src/domain/ingredients/types.ts`); `buildNutrientIdMap`/`extractNutrition` (Task 3); `assemblePortions` (Task 4)
- Produces: `parseCsvFile<T>(path): T[]`; `loadSrLegacyFoods(dataDir): Ingredient[]`

This is the first task that reads real files from disk, so it's tested against a small, hand-written fixture dataset — not the full 7,793-row real download (that happens once, for real, in Task 6 and Task 8).

- [ ] **Step 1: Write the fixture CSVs**

Create `scripts/usda-import/__fixtures__/mini-dataset/food.csv`:

```csv
fdc_id,data_type,description,food_category_id
1001,sr_legacy_food,"Oats, rolled",100
1002,sr_legacy_food,"Peculiar Snack",200
```

Create `scripts/usda-import/__fixtures__/mini-dataset/nutrient.csv`:

```csv
id,name,unit_name,nutrient_nbr
1008,Energy,KCAL,208
1003,Protein,G,203
1004,Total lipid (fat),G,204
1005,"Carbohydrate, by difference",G,205
```

Create `scripts/usda-import/__fixtures__/mini-dataset/food_nutrient.csv`:

```csv
fdc_id,nutrient_id,amount
1001,1008,389
1001,1003,16.9
1001,1004,6.9
1001,1005,66.3
1002,1008,0
```

Create `scripts/usda-import/__fixtures__/mini-dataset/food_portion.csv`:

```csv
fdc_id,amount,measure_unit_id,portion_description,modifier,gram_weight
1001,1,9999,1 cup,,80
1002,1,9999,,,50
```

This mirrors the real SR Legacy shape confirmed in Task 1 — `measure_unit_id` always `9999`, real unit info only in free text. Oats has a usable, volume-detectable portion; the second food's only portion row has no descriptive text in either `modifier` or `portion_description`, so it should be dropped entirely (matching the domain's `water` fixture from Plan 1, which deliberately has no usable portions).

- [ ] **Step 2: Write the failing test**

Create `scripts/usda-import/loadSrLegacyFoods.test.ts`:

```ts
import { join } from 'node:path';
import { loadSrLegacyFoods } from './loadSrLegacyFoods';

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'mini-dataset');

describe('loadSrLegacyFoods', () => {
  it('loads every food as an Ingredient with usda: id prefix', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients).toHaveLength(2);
    expect(ingredients.map((i) => i.id)).toEqual(['usda:1001', 'usda:1002']);
    expect(ingredients.map((i) => i.source)).toEqual(['usda', 'usda']);
  });

  it('carries the food description as the name', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[0].name).toBe('Oats, rolled');
  });

  it('extracts nutrition per 100g', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[0].nutritionPer100g).toEqual({
      kcal: 389, proteinG: 16.9, fatG: 6.9, carbsG: 66.3,
    });
  });

  it('assembles a usable portion from free text', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[0].portions).toEqual([
      { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 },
    ]);
  });

  it('drops a portion row with no descriptive text', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[1].portions).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest scripts/usda-import/loadSrLegacyFoods.test.ts`
Expected: FAIL — `Cannot find module './loadSrLegacyFoods'`

- [ ] **Step 4: Write minimal implementation**

Create `scripts/usda-import/parseCsv.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

export function parseCsvFile<T>(path: string): T[] {
  const content = readFileSync(path, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true }) as T[];
}
```

Create `scripts/usda-import/loadSrLegacyFoods.ts`:

```ts
import { join } from 'node:path';
import type { Ingredient } from '../../src/domain/ingredients/types';
import { parseCsvFile } from './parseCsv.ts';
import { buildNutrientIdMap, extractNutrition } from './extractNutrition.ts';
import { assemblePortions } from './assemblePortions.ts';
import type { FoodNutrientRow, FoodPortionRow, FoodRow, NutrientRow } from './types';

export function loadSrLegacyFoods(dataDir: string): Ingredient[] {
  const foods = parseCsvFile<FoodRow>(join(dataDir, 'food.csv'));
  const nutrients = parseCsvFile<NutrientRow>(join(dataDir, 'nutrient.csv'));
  const foodNutrients = parseCsvFile<FoodNutrientRow>(join(dataDir, 'food_nutrient.csv'));
  const foodPortions = parseCsvFile<FoodPortionRow>(join(dataDir, 'food_portion.csv'));

  const nutrientIdMap = buildNutrientIdMap(nutrients);
  const foodNutrientsByFood = groupBy(foodNutrients, (row) => row.fdc_id);
  const foodPortionsByFood = groupBy(foodPortions, (row) => row.fdc_id);

  return foods.map((food) => ({
    id: `usda:${food.fdc_id}`,
    name: food.description,
    nutritionPer100g: extractNutrition(foodNutrientsByFood.get(food.fdc_id) ?? [], nutrientIdMap),
    portions: assemblePortions(foodPortionsByFood.get(food.fdc_id) ?? []),
    source: 'usda' as const,
  }));
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest scripts/usda-import/loadSrLegacyFoods.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/usda-import/parseCsv.ts scripts/usda-import/loadSrLegacyFoods.ts \
  scripts/usda-import/loadSrLegacyFoods.test.ts scripts/usda-import/__fixtures__
git commit -m "feat(usda-import): load the full USDA CSV dataset into Ingredient records"
```

---

### Task 6: Confirm portion coverage against the real dataset

**Files:**
- Create: `scripts/usda-import/analyzeCoverage.ts`
- Create: `scripts/usda-import/reportCoverage.ts`
- Test: `scripts/usda-import/analyzeCoverage.test.ts`

**Interfaces:**
- Consumes: `Ingredient` (`src/domain/ingredients/types.ts`); `loadSrLegacyFoods` (Task 5)
- Produces: `analyzeCoverage(ingredients): CoverageReport`; a runnable report against the real dataset

Spec section 11's highest-risk item — whether USDA supplies enough portion data for the volume-conversion path to be useful — was already measured directly while writing this plan (see the "Decision" section above: 96.6% any usable portion, 42.3% volume specifically, verified independently twice against the real 14,449-row `food_portion.csv`). This task's job is to make that measurement reproducible from this plan's own code, and to confirm your own implementation of Tasks 2, 4, and 5 reproduces the same numbers — if it doesn't, something upstream has a bug.

- [ ] **Step 1: Write the failing test**

Create `scripts/usda-import/analyzeCoverage.test.ts`:

```ts
import { analyzeCoverage } from './analyzeCoverage';
import type { Ingredient } from '../../src/domain/ingredients/types';

const withVolume: Ingredient = {
  id: 'usda:1', name: 'Oats', source: 'usda',
  nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  portions: [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
};

const withCountOnly: Ingredient = {
  id: 'usda:2', name: 'Onion', source: 'usda',
  nutritionPer100g: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: '1 medium' }, gramsPerUnit: 110 }],
};

const withNoPortions: Ingredient = {
  id: 'usda:3', name: 'Water', source: 'usda',
  nutritionPer100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  portions: [],
};

describe('analyzeCoverage', () => {
  it('counts totals, any-portion coverage, and volume-portion coverage separately', () => {
    const report = analyzeCoverage([withVolume, withCountOnly, withNoPortions]);
    expect(report).toEqual({ total: 3, withAnyPortion: 2, withVolumePortion: 1 });
  });

  it('returns zeros for an empty ingredient list', () => {
    expect(analyzeCoverage([])).toEqual({ total: 0, withAnyPortion: 0, withVolumePortion: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest scripts/usda-import/analyzeCoverage.test.ts`
Expected: FAIL — `Cannot find module './analyzeCoverage'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/usda-import/analyzeCoverage.ts`:

```ts
import type { Ingredient } from '../../src/domain/ingredients/types';

export type CoverageReport = {
  total: number;
  withAnyPortion: number;
  withVolumePortion: number;
};

export function analyzeCoverage(ingredients: Ingredient[]): CoverageReport {
  let withAnyPortion = 0;
  let withVolumePortion = 0;

  for (const ingredient of ingredients) {
    if (ingredient.portions.length > 0) withAnyPortion += 1;
    if (ingredient.portions.some((p) => p.unit.kind === 'volume')) withVolumePortion += 1;
  }

  return { total: ingredients.length, withAnyPortion, withVolumePortion };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest scripts/usda-import/analyzeCoverage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the report against the real, full dataset**

Create `scripts/usda-import/reportCoverage.ts` (not unit tested — it's a one-shot CLI report, not reusable logic):

```ts
import { loadSrLegacyFoods } from './loadSrLegacyFoods.ts';
import { analyzeCoverage } from './analyzeCoverage.ts';

const dataDir = process.argv[2];
if (!dataDir) {
  console.error('Usage: node reportCoverage.ts <path-to-usda-csv-directory>');
  process.exit(1);
}

const ingredients = loadSrLegacyFoods(dataDir);
const report = analyzeCoverage(ingredients);

console.log(`Total foods: ${report.total}`);
console.log(`With any usable portion: ${report.withAnyPortion} (${pct(report.withAnyPortion, report.total)})`);
console.log(`With a volume portion: ${report.withVolumePortion} (${pct(report.withVolumePortion, report.total)})`);

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${((n / total) * 100).toFixed(1)}%`;
}
```

Run it against the real dataset downloaded in Task 1:

```bash
node scripts/usda-import/reportCoverage.ts scripts/usda-import/.data/FoodData_Central_sr_legacy_food_csv_2018-04
```

Expected output (these exact figures were independently verified twice while writing this plan):

```
Total foods: 7793
With any usable portion: 7526 (96.6%)
With a volume portion: 3299 (42.3%)
```

**If your numbers differ noticeably**, one of Tasks 2, 4, or 5 diverges from this plan's code — re-check `detectUnitFromText`'s rule ordering and `assemblePortions`'s text-building before assuming the dataset changed (it shouldn't have; SR Legacy is frozen).

- [ ] **Step 6: Commit**

```bash
git add scripts/usda-import/analyzeCoverage.ts scripts/usda-import/analyzeCoverage.test.ts \
  scripts/usda-import/reportCoverage.ts
git commit -m "feat(usda-import): confirm real USDA portion coverage matches expectations"
```

---

### Task 7: Write ingredients to a bundled SQLite database

**Files:**
- Create: `scripts/usda-import/buildDatabase.ts`
- Test: `scripts/usda-import/buildDatabase.test.ts`

**Interfaces:**
- Consumes: `Ingredient` (`src/domain/ingredients/types.ts`)
- Produces: `buildDatabase(ingredients, outPath): void`

This task doesn't depend on which USDA dataset produced the `Ingredient[]` — it only needs the domain shape, so it's identical regardless of the SR-Legacy-vs-Foundation-Foods decision above.

- [ ] **Step 1: Write the failing test**

Create `scripts/usda-import/buildDatabase.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDatabase } from './buildDatabase';
import type { Ingredient } from '../../src/domain/ingredients/types';

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, rolled', source: 'usda',
  nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  portions: [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
};

const onion: Ingredient = {
  id: 'usda:1002', name: 'Onion, raw', source: 'usda',
  nutritionPer100g: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: '1 medium' }, gramsPerUnit: 110 }],
};

describe('buildDatabase', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'usda-db-test-'));
    dbPath = join(dir, 'usda.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes one row per ingredient into the ingredients table', () => {
    buildDatabase([oats, onion], dbPath);
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM ingredients ORDER BY id').all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'usda:1001', name: 'Oats, rolled', kcal: 389 });
    db.close();
  });

  it('writes one row per portion, tagged by unit kind', () => {
    buildDatabase([oats, onion], dbPath);
    const db = new DatabaseSync(dbPath);
    const oatPortions = db.prepare('SELECT * FROM portions WHERE ingredient_id = ?').all('usda:1001');
    expect(oatPortions).toEqual([
      { ingredient_id: 'usda:1001', label: '1 cup', unit_kind: 'volume', unit_symbol: 'cup', unit_label: null, grams_per_unit: 80 },
    ]);
    const onionPortions = db.prepare('SELECT * FROM portions WHERE ingredient_id = ?').all('usda:1002');
    expect(onionPortions).toEqual([
      { ingredient_id: 'usda:1002', label: '1 medium', unit_kind: 'count', unit_symbol: null, unit_label: '1 medium', grams_per_unit: 110 },
    ]);
    db.close();
  });

  it('writes no portion rows for an ingredient with none', () => {
    const water: Ingredient = {
      id: 'usda:1003', name: 'Water', source: 'usda',
      nutritionPer100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      portions: [],
    };
    buildDatabase([water], dbPath);
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM portions WHERE ingredient_id = ?').all('usda:1003');
    expect(rows).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest scripts/usda-import/buildDatabase.test.ts`
Expected: FAIL — `Cannot find module './buildDatabase'`

If instead it fails with a Node module resolution error for `node:sqlite` (rather than the expected "module not found" for `./buildDatabase`), the `jest-expo` preset's default test environment doesn't expose Node core modules the way plain Node does. Add `"testEnvironment": "node"` to the `"jest"` block in `package.json` and re-run before continuing.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/usda-import/buildDatabase.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import type { Ingredient } from '../../src/domain/ingredients/types';

export function buildDatabase(ingredients: Ingredient[], outPath: string): void {
  const db = new DatabaseSync(outPath);

  db.exec(`
    CREATE TABLE ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kcal REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g REAL NOT NULL,
      fat_g REAL NOT NULL
    );
    CREATE INDEX idx_ingredients_name ON ingredients(name COLLATE NOCASE);

    CREATE TABLE portions (
      ingredient_id TEXT NOT NULL,
      label TEXT NOT NULL,
      unit_kind TEXT NOT NULL,
      unit_symbol TEXT,
      unit_label TEXT,
      grams_per_unit REAL NOT NULL
    );
    CREATE INDEX idx_portions_ingredient ON portions(ingredient_id);
  `);

  const insertIngredient = db.prepare(
    'INSERT INTO ingredients (id, name, kcal, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertPortion = db.prepare(
    'INSERT INTO portions (ingredient_id, label, unit_kind, unit_symbol, unit_label, grams_per_unit) VALUES (?, ?, ?, ?, ?, ?)',
  );

  for (const ingredient of ingredients) {
    insertIngredient.run(
      ingredient.id,
      ingredient.name,
      ingredient.nutritionPer100g.kcal,
      ingredient.nutritionPer100g.proteinG,
      ingredient.nutritionPer100g.carbsG,
      ingredient.nutritionPer100g.fatG,
    );
    for (const portion of ingredient.portions) {
      const unitSymbol = portion.unit.kind === 'count' ? null : portion.unit.symbol;
      const unitLabel = portion.unit.kind === 'count' ? portion.unit.label : null;
      insertPortion.run(
        ingredient.id, portion.label, portion.unit.kind, unitSymbol, unitLabel, portion.gramsPerUnit,
      );
    }
  }

  db.close();
}
```

`unit_kind` plus exactly one of `unit_symbol`/`unit_label` is the flattened, SQL-friendly version of the domain's `Unit` discriminated union — Task 9 reconstructs the union from these three columns on the way back out.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest scripts/usda-import/buildDatabase.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/usda-import/buildDatabase.ts scripts/usda-import/buildDatabase.test.ts package.json
git commit -m "feat(usda-import): write ingredients into a SQLite database file"
```

---

### Task 8: Run the real import and commit the bundled database

**Files:**
- Create: `scripts/usda-import/import.ts`
- Modify: `package.json` (add `import:usda` script)
- Create: `assets/usda.db` (binary, committed)

**Interfaces:**
- Consumes: `loadSrLegacyFoods` (Task 5); `buildDatabase` (Task 7)
- Produces: `assets/usda.db`, the artifact every later task and Plan 3 depend on

- [ ] **Step 1: Write the orchestrator**

Create `scripts/usda-import/import.ts`:

```ts
// USDA FoodData Central data is public domain (CC0 1.0); USDA requests,
// but does not require, attribution as "FoodData Central".
// https://fdc.nal.usda.gov
import { loadSrLegacyFoods } from './loadSrLegacyFoods.ts';
import { buildDatabase } from './buildDatabase.ts';

const dataDir = process.argv[2];
const outPath = process.argv[3] ?? './assets/usda.db';

if (!dataDir) {
  console.error('Usage: node scripts/usda-import/import.ts <path-to-usda-csv-directory> [outPath]');
  process.exit(1);
}

const ingredients = loadSrLegacyFoods(dataDir);
console.log(`Loaded ${ingredients.length} ingredients from ${dataDir}`);

buildDatabase(ingredients, outPath);
console.log(`Wrote ${outPath}`);
```

- [ ] **Step 2: Add the npm script**

Add to `package.json`'s `"scripts"` block. Task 1 confirmed neither flag is needed on this machine (Node v26.7.0 strips types and supports `node:sqlite` unflagged):

```json
"import:usda": "node scripts/usda-import/import.ts"
```

- [ ] **Step 3: Run it for real**

```bash
mkdir -p assets
npm run import:usda -- scripts/usda-import/.data/FoodData_Central_sr_legacy_food_csv_2018-04
```

Expected: prints `Loaded 7793 ingredients from ...` and `Wrote ./assets/usda.db`.

- [ ] **Step 4: Verify the output**

```bash
ls -la assets/usda.db
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('assets/usda.db');
console.log('ingredients:', db.prepare('SELECT COUNT(*) AS n FROM ingredients').get().n);
console.log('portions:', db.prepare('SELECT COUNT(*) AS n FROM portions').get().n);
db.close();
"
```

Expected: a file size in the low single-digit megabytes (a from-scratch measurement during this plan's own research produced 2.31 MB for an equivalent dataset — this is spec section 11 item 3, the bundle-size assumption, now measured instead of guessed) and `ingredients: 7793`.

- [ ] **Step 5: Confirm `.db` files aren't accidentally gitignored**

```bash
git check-ignore -v assets/usda.db || echo "not ignored, good"
```

Expected: `not ignored, good`. (The scaffold's `.gitignore`, inherited from `create-expo-app` in Plan 1, does not exclude `*.db`, but confirm rather than assume.)

- [ ] **Step 6: Commit the script and the generated database**

```bash
git add scripts/usda-import/import.ts package.json assets/usda.db
git commit -m "feat(usda-import): run the real import and bundle assets/usda.db"
```

---

### Task 9: Runtime row-mapping — pure functions, fully tested

**Files:**
- Create: `src/data/usda/mapRow.ts`
- Test: `src/data/usda/mapRow.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `Portion` (`src/domain/ingredients/types.ts`); `Unit`, `MassSymbol`, `VolumeSymbol` (`src/domain/units/types.ts`)
- Produces: `IngredientRow`, `PortionRow` (typed SQLite row shapes); `mapPortionRow(row): Portion`; `assembleIngredient(ingredientRow, portionRows): Ingredient`; `buildSearchQuery(term): { sql, params }`

`expo-sqlite` cannot run inside Jest at all — it only works on-device or in an E2E test. Every piece of logic that *can* be tested without it — building SQL, turning a raw row into a typed `Ingredient` — lives here as plain functions with no `expo-sqlite` import. Only Task 10's thin driver actually calls `expo-sqlite`, and it stays deliberately small because it can't be verified by Jest.

- [ ] **Step 1: Write the failing test**

Create `src/data/usda/mapRow.test.ts`:

```ts
import { assembleIngredient, buildSearchQuery, mapPortionRow } from './mapRow';
import type { IngredientRow, PortionRow } from './mapRow';

describe('mapPortionRow', () => {
  it('reconstructs a mass unit', () => {
    const row: PortionRow = {
      ingredient_id: 'usda:1', label: '1 oz', unit_kind: 'mass', unit_symbol: 'oz', unit_label: null, grams_per_unit: 28.35,
    };
    expect(mapPortionRow(row)).toEqual({
      label: '1 oz', unit: { kind: 'mass', symbol: 'oz' }, gramsPerUnit: 28.35,
    });
  });

  it('reconstructs a volume unit', () => {
    const row: PortionRow = {
      ingredient_id: 'usda:1', label: '1 cup', unit_kind: 'volume', unit_symbol: 'cup', unit_label: null, grams_per_unit: 80,
    };
    expect(mapPortionRow(row)).toEqual({
      label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80,
    });
  });

  it('reconstructs a count unit', () => {
    const row: PortionRow = {
      ingredient_id: 'usda:2', label: '1 medium', unit_kind: 'count', unit_symbol: null, unit_label: '1 medium', grams_per_unit: 110,
    };
    expect(mapPortionRow(row)).toEqual({
      label: '1 medium', unit: { kind: 'count', label: '1 medium' }, gramsPerUnit: 110,
    });
  });
});

describe('assembleIngredient', () => {
  it('combines an ingredient row with its portion rows', () => {
    const ingredientRow: IngredientRow = {
      id: 'usda:1', name: 'Oats, rolled', kcal: 389, protein_g: 16.9, carbs_g: 66.3, fat_g: 6.9,
    };
    const portionRows: PortionRow[] = [
      { ingredient_id: 'usda:1', label: '1 cup', unit_kind: 'volume', unit_symbol: 'cup', unit_label: null, grams_per_unit: 80 },
    ];
    expect(assembleIngredient(ingredientRow, portionRows)).toEqual({
      id: 'usda:1',
      name: 'Oats, rolled',
      nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
      portions: [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
      source: 'usda',
    });
  });

  it('returns an empty portions array when there are none', () => {
    const ingredientRow: IngredientRow = {
      id: 'usda:3', name: 'Water', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    };
    expect(assembleIngredient(ingredientRow, []).portions).toEqual([]);
  });
});

describe('buildSearchQuery', () => {
  it('wraps the search term in wildcards and matches case-insensitively', () => {
    expect(buildSearchQuery('oat')).toEqual({
      sql: 'SELECT * FROM ingredients WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 25',
      params: ['%oat%'],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/usda/mapRow.test.ts`
Expected: FAIL — `Cannot find module './mapRow'`

- [ ] **Step 3: Write minimal implementation**

Create `src/data/usda/mapRow.ts`:

```ts
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import type { MassSymbol, Unit, VolumeSymbol } from '../../domain/units/types';

export type IngredientRow = {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type PortionRow = {
  ingredient_id: string;
  label: string;
  unit_kind: string;
  unit_symbol: string | null;
  unit_label: string | null;
  grams_per_unit: number;
};

function mapUnit(row: PortionRow): Unit {
  switch (row.unit_kind) {
    case 'mass':
      return { kind: 'mass', symbol: row.unit_symbol as MassSymbol };
    case 'volume':
      return { kind: 'volume', symbol: row.unit_symbol as VolumeSymbol };
    case 'count':
      return { kind: 'count', label: row.unit_label as string };
    default:
      // Our own import script (Task 7) is the only writer of this database.
      // Reaching this means the bundled asset is corrupted — a genuine
      // emergency, not an expected failure, so it throws rather than
      // returning a Result.
      throw new Error(`Corrupted USDA database: unknown unit_kind "${row.unit_kind}"`);
  }
}

export function mapPortionRow(row: PortionRow): Portion {
  return { label: row.label, unit: mapUnit(row), gramsPerUnit: row.grams_per_unit };
}

export function assembleIngredient(ingredientRow: IngredientRow, portionRows: PortionRow[]): Ingredient {
  return {
    id: ingredientRow.id,
    name: ingredientRow.name,
    nutritionPer100g: {
      kcal: ingredientRow.kcal,
      proteinG: ingredientRow.protein_g,
      carbsG: ingredientRow.carbs_g,
      fatG: ingredientRow.fat_g,
    },
    portions: portionRows.map(mapPortionRow),
    source: 'usda',
  };
}

export function buildSearchQuery(term: string): { sql: string; params: unknown[] } {
  return {
    sql: 'SELECT * FROM ingredients WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 25',
    params: [`%${term}%`],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/data/usda/mapRow.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/usda/mapRow.ts src/data/usda/mapRow.test.ts
git commit -m "feat(data): map SQLite rows onto domain Ingredient (pure, tested)"
```

---

### Task 10: The `expo-sqlite` driver — thin, untested, manually verified

**Files:**
- Create: `metro.config.js`
- Create: `src/data/usda/database.ts`
- Modify: `package.json` (add `expo-sqlite`, `expo-asset`, `expo-file-system`)

**Interfaces:**
- Consumes: `mapPortionRow`/`assembleIngredient`/`buildSearchQuery`, `IngredientRow`/`PortionRow` (Task 9)
- Produces: `searchIngredients(term): Promise<Ingredient[]>`; `getIngredientById(id): Promise<Ingredient | null>`

There is no RED/GREEN cycle in this task. `expo-sqlite` genuinely cannot run under Jest — confirmed while researching this plan, not assumed — so this file is intentionally the thinnest possible wrapper around it, with all the logic that *can* be tested already covered by Task 9. Verifying this task means running the app on a device or emulator once Plan 3 exists, not `npm test`.

- [ ] **Step 1: Install the Expo packages this task needs**

```bash
npx expo install expo-sqlite expo-asset expo-file-system
```

`npx expo install` (not plain `npm install`) picks versions matched to this project's Expo SDK, per the `expo:expo-overview` skill's shared setup rules.

- [ ] **Step 2: Register `.db` as a bundleable asset extension**

Metro (the bundler) only treats known file extensions as static assets by default; `.db` isn't one of them, so `require('../../../assets/usda.db')` would otherwise fail to bundle.

Create `metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('db');

module.exports = config;
```

- [ ] **Step 3: Write the driver**

Create `src/data/usda/database.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import type { Ingredient } from '../../domain/ingredients/types';
import {
  assembleIngredient, buildSearchQuery, type IngredientRow, type PortionRow,
} from './mapRow';

const DB_NAME = 'usda.db';

async function ensureDatabaseCopied(): Promise<void> {
  const sqliteDir = `${FileSystem.documentDirectory}SQLite`;
  const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  }

  const dbPath = `${sqliteDir}/${DB_NAME}`;
  const dbInfo = await FileSystem.getInfoAsync(dbPath);
  if (dbInfo.exists) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro requires a literal require() to bundle a static asset.
  const [asset] = await Asset.loadAsync(require('../../../assets/usda.db'));
  if (!asset.localUri) {
    throw new Error('Bundled USDA database asset failed to resolve a local URI.');
  }
  await FileSystem.copyAsync({ from: asset.localUri, to: dbPath });
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = ensureDatabaseCopied().then(() => SQLite.openDatabaseAsync(DB_NAME));
  }
  return dbPromise;
}

async function loadPortions(db: SQLite.SQLiteDatabase, ingredientId: string): Promise<PortionRow[]> {
  return db.getAllAsync<PortionRow>('SELECT * FROM portions WHERE ingredient_id = ?', [ingredientId]);
}

export async function searchIngredients(term: string): Promise<Ingredient[]> {
  const db = await getDatabase();
  const { sql, params } = buildSearchQuery(term);
  const ingredientRows = await db.getAllAsync<IngredientRow>(sql, params);

  const results: Ingredient[] = [];
  for (const row of ingredientRows) {
    results.push(assembleIngredient(row, await loadPortions(db, row.id)));
  }
  return results;
}

export async function getIngredientById(id: string): Promise<Ingredient | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<IngredientRow>('SELECT * FROM ingredients WHERE id = ?', [id]);
  if (!row) return null;
  return assembleIngredient(row, await loadPortions(db, id));
}
```

`Asset.loadAsync` plus `FileSystem.copyAsync` is the combination confirmed to actually work for bundled local assets on the current Expo SDK — `FileSystem.downloadAsync`, which appears in some older examples, is documented as broken for local (non-network) asset URIs and is deliberately not used here.

- [ ] **Step 4: Run lint and fix the expected `require()` violation**

```bash
npm run lint
```

Expected: this flags the `require('../../../assets/usda.db')` line — the same class of issue Plan 1 hit with `eslint.config.js` itself, where the ESLint-recommended ruleset forbids `require()` by default. The `eslint-disable-next-line` comment already included above is the fix; confirm it's present and re-run:

```bash
npm run lint
```

Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add metro.config.js src/data/usda/database.ts package.json package-lock.json
git commit -m "feat(data): add expo-sqlite driver for the bundled USDA database"
```

---

### Task 11: JSON file store — a `FileIO` seam, fully tested without any native module

**Files:**
- Create: `src/data/store/fileIO.ts`
- Create: `src/data/store/jsonFileStore.ts`
- Test: `src/data/store/jsonFileStore.test.ts`

**Interfaces:**
- Consumes: `Recipe` (`src/domain/recipes/types.ts`)
- Produces: `FileIO` interface; `UserData`; `readUserData(io, dir): Promise<UserData>`; `writeUserData(io, dir, data): Promise<void>`

Same architectural move as Task 9/10: `expo-file-system`, like `expo-sqlite`, is a native module and can't be meaningfully exercised inside Jest either. Rather than gamble on that, the actual read/write logic is written against a small `FileIO` interface — four methods, no Expo import anywhere near it — so it can be fully tested against a real temporary directory on this machine using Node's own `fs/promises`, and separately wired to `expo-file-system` for the real app in Task 13.

- [ ] **Step 1: Define the seam**

Create `src/data/store/fileIO.ts`:

```ts
export interface FileIO {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/data/store/jsonFileStore.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readUserData, writeUserData } from './jsonFileStore';
import type { FileIO } from './fileIO';
import type { Recipe } from '../../domain/recipes/types';

const nodeFileIO: FileIO = {
  async exists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  readText: (path) => fs.readFile(path, 'utf-8'),
  writeText: (path, content) => fs.writeFile(path, content, 'utf-8'),
  move: (from, to) => fs.rename(from, to),
};

const porridge: Recipe = {
  id: 'recipe-1', name: 'Porridge', servings: 2,
  ingredients: [{ ingredientId: 'usda:1001', quantity: { grams: 200, input: { amount: 200, unit: { kind: 'mass', symbol: 'g' } } } }],
  steps: ['Combine and simmer.'],
};

describe('jsonFileStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'user-data-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty store when no file exists yet', async () => {
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [] });
  });

  it('round-trips a write through a read', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge] });
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [porridge] });
  });

  it('overwrites the previous contents on a second write, not appends', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge] });
    await writeUserData(nodeFileIO, dir, { recipes: [] });
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [] });
  });

  it('leaves no leftover temp file after a write', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge] });
    const entries = await fs.readdir(dir);
    expect(entries).toEqual(['user-data.json']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/data/store/jsonFileStore.test.ts`
Expected: FAIL — `Cannot find module './jsonFileStore'`

- [ ] **Step 4: Write minimal implementation**

Create `src/data/store/jsonFileStore.ts`:

```ts
import type { Recipe } from '../../domain/recipes/types';
import type { FileIO } from './fileIO';

export type UserData = {
  recipes: Recipe[];
};

const EMPTY_USER_DATA: UserData = { recipes: [] };

function userDataPath(dir: string): string {
  return `${dir}/user-data.json`;
}

function tempPath(dir: string): string {
  return `${dir}/user-data.json.tmp`;
}

export async function readUserData(io: FileIO, dir: string): Promise<UserData> {
  const path = userDataPath(dir);
  if (!(await io.exists(path))) {
    return EMPTY_USER_DATA;
  }
  const content = await io.readText(path);
  return JSON.parse(content) as UserData;
}

export async function writeUserData(io: FileIO, dir: string, data: UserData): Promise<void> {
  const tmp = tempPath(dir);
  await io.writeText(tmp, JSON.stringify(data));
  await io.move(tmp, userDataPath(dir));
}
```

`move` (a rename) replacing the real file only after the new content is fully written on disk is what spec section 7 means by "an interrupted write leaves the previous file intact" — a crash mid-`writeText` only ever corrupts the `.tmp` file, which the next `writeUserData` call overwrites from scratch; the real `user-data.json` is never touched until the rename, and a rename either fully happens or fully doesn't.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/data/store/jsonFileStore.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/store/fileIO.ts src/data/store/jsonFileStore.ts src/data/store/jsonFileStore.test.ts
git commit -m "feat(data): add JSON file store behind a testable FileIO seam"
```

---

### Task 12: `RecipeRepository`

**Files:**
- Create: `src/data/store/recipeRepository.ts`
- Test: `src/data/store/recipeRepository.test.ts`

**Interfaces:**
- Consumes: `Recipe` (`src/domain/recipes/types.ts`); `FileIO` (Task 11); `readUserData`/`writeUserData` (Task 11)
- Produces: `RecipeRepository` interface; `createRecipeRepository(io, dir): RecipeRepository`

This is the exact interface from spec section 7 — `data/` deciding *how* to persist what the domain merely declares it needs.

- [ ] **Step 1: Write the failing test**

Create `src/data/store/recipeRepository.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecipeRepository } from './recipeRepository';
import type { FileIO } from './fileIO';
import type { Recipe } from '../../domain/recipes/types';

const nodeFileIO: FileIO = {
  async exists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  readText: (path) => fs.readFile(path, 'utf-8'),
  writeText: (path, content) => fs.writeFile(path, content, 'utf-8'),
  move: (from, to) => fs.rename(from, to),
};

const porridge: Recipe = {
  id: 'recipe-1', name: 'Porridge', servings: 2,
  ingredients: [{ ingredientId: 'usda:1001', quantity: { grams: 200, input: { amount: 200, unit: { kind: 'mass', symbol: 'g' } } } }],
  steps: ['Combine and simmer.'],
};

const soup: Recipe = {
  id: 'recipe-2', name: 'Soup', servings: 4,
  ingredients: [{ ingredientId: 'usda:1002', quantity: { grams: 220, input: { amount: 220, unit: { kind: 'mass', symbol: 'g' } } } }],
  steps: ['Simmer everything.'],
};

describe('createRecipeRepository', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'recipe-repo-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list before anything is saved', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    expect(await repo.getAll()).toEqual([]);
  });

  it('save then getAll returns the saved recipe', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    await repo.save(porridge);
    expect(await repo.getAll()).toEqual([porridge]);
  });

  it('saving an existing id overwrites rather than duplicating', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    await repo.save(porridge);
    await repo.save({ ...porridge, name: 'Porridge v2' });
    const all = await repo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Porridge v2');
  });

  it('delete removes only the targeted recipe', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    await repo.save(porridge);
    await repo.save(soup);
    await repo.delete(porridge.id);
    expect(await repo.getAll()).toEqual([soup]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/store/recipeRepository.test.ts`
Expected: FAIL — `Cannot find module './recipeRepository'`

- [ ] **Step 3: Write minimal implementation**

Create `src/data/store/recipeRepository.ts`:

```ts
import type { Recipe } from '../../domain/recipes/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData } from './jsonFileStore';

export interface RecipeRepository {
  getAll(): Promise<Recipe[]>;
  save(recipe: Recipe): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createRecipeRepository(io: FileIO, dir: string): RecipeRepository {
  return {
    async getAll() {
      const data = await readUserData(io, dir);
      return data.recipes;
    },
    async save(recipe: Recipe) {
      const data = await readUserData(io, dir);
      const others = data.recipes.filter((r) => r.id !== recipe.id);
      await writeUserData(io, dir, { recipes: [...others, recipe] });
    },
    async delete(id: string) {
      const data = await readUserData(io, dir);
      const remaining = data.recipes.filter((r) => r.id !== id);
      await writeUserData(io, dir, { recipes: remaining });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/data/store/recipeRepository.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/store/recipeRepository.ts src/data/store/recipeRepository.test.ts
git commit -m "feat(data): implement RecipeRepository over the JSON file store"
```

---

### Task 13: The `expo-file-system` driver, public entry point, and full-suite verification

**Files:**
- Create: `src/data/store/expoFileIO.ts`
- Create: `src/data/index.ts`
- Test: run the entire suite

**Interfaces:**
- Consumes: everything in this plan
- Produces: `src/data/index.ts` — the single import surface `ui/` (Plan 3) will use

- [ ] **Step 1: Write the real `FileIO` implementation**

Create `src/data/store/expoFileIO.ts`:

```ts
import * as FileSystem from 'expo-file-system';
import type { FileIO } from './fileIO';

export const expoFileIO: FileIO = {
  async exists(path) {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  },
  readText: (path) => FileSystem.readAsStringAsync(path),
  writeText: (path, content) => FileSystem.writeAsStringAsync(path, content),
  move: (from, to) => FileSystem.moveAsync({ from, to }),
};
```

No test file — this is the same class of thin, native-module-backed driver as Task 10's `database.ts`, and every method it implements is already covered by Task 11 and 12's tests against the `FileIO` interface it conforms to.

- [ ] **Step 2: Write the entry point**

Create `src/data/index.ts`:

```ts
export type { RecipeRepository } from './store/recipeRepository';
export { createRecipeRepository } from './store/recipeRepository';
export { expoFileIO } from './store/expoFileIO';
export type { FileIO } from './store/fileIO';
export { searchIngredients, getIngredientById } from './usda/database';
```

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS — every test from this plan plus all 34 from Plan 1, with no failures.

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: PASS, no errors (including the `require()` exception added in Task 10).

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/store/expoFileIO.ts src/data/index.ts
git commit -m "feat(data): add public entry point for the data layer"
```

---

## Definition of Done

- [ ] `npm test` passes — every pure function in this plan (unit detection, nutrition extraction, portion assembly, CSV loading, coverage analysis, row mapping, the JSON file store, and the recipe repository) has tests covering success and failure paths
- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `assets/usda.db` exists, is committed, contains 7,793 ingredients, and was built from the real SR Legacy dataset (not a fixture)
- [ ] Task 6's coverage report reproduces the real, twice-verified numbers (96.6% any usable portion, 42.3% volume portion) — flagged to whoever plans Plan 3's ingredient-search UX
- [ ] Neither `src/data/usda/database.ts` nor `src/data/store/expoFileIO.ts` — the two files that genuinely cannot be tested under Jest — contain any logic beyond wiring a native module to the already-tested pure functions around them

## What this plan deliberately does not build

Meal-plan persistence and user-created-ingredient storage are not part of this plan — the original three-plan split (see `docs/superpowers/plans/2026-08-29-domain-core.md`'s companion memory) scoped Plan 2 to the USDA reader and the recipe repository only. Both are a small, symmetric extension of the same `jsonFileStore`/`FileIO` pattern this plan establishes, and are better sized as part of Plan 3 once the UI flows that need them (the meal planner screen, the `NO_PORTION_DATA` manual-entry prompt) are being designed together with their storage.

Adding USDA's Foundation Foods dataset alongside SR Legacy — to raise the 42.3% volume-coverage figure, since Foundation Foods properly populates `measure_unit_id` instead of always defaulting to `9999` — is also out of scope here, and is a well-contained follow-up rather than a rewrite: extend `assemblePortions` (Task 4) to try a structured `measure_unit_id` → `measure_unit.csv` join first, falling back to `detectUnitFromText` (Task 2) only when that join is absent or unresolved, exactly as it already does unconditionally today.
