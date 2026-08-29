# Macro Recipe App — Plan 1: Foundation & Domain Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully tested, UI-free TypeScript library containing all business logic for the app — unit conversion, macro calculation, recipe scaling, and grocery-list aggregation.

**Architecture:** A layered design whose innermost layer, `src/domain/`, is plain TypeScript that never imports React or React Native. This boundary is enforced by ESLint, not convention. Every function in this plan is pure: same input, same output, no database, no screen, no clock. That is what allows the entire test suite to run in milliseconds with no emulator.

**Tech Stack:** Expo (managed) · React Native · TypeScript · Jest (`jest-expo` preset) · ESLint

**Spec:** `docs/superpowers/specs/2026-08-29-macro-recipe-app-design.md`

## Global Constraints

- **Nothing under `src/domain/` may import `react`, `react-native`, `expo`, or any `expo-*` package.** Enforced by ESLint `no-restricted-imports`.
- **All quantities are stored in grams.** Never persist a volume or count as the authoritative amount.
- **Nutrition is always per 100 g**, and the field is named `nutritionPer100g` to make the basis unmisreadable.
- **Expected failures return `Result`; only genuine emergencies throw.**
- **Volume conversion is ratio-based, never via absolute millilitres and an assumed density.**
- **Mass factors are exact by definition:** `oz = 28.349523125 g`, `lb = 453.59237 g`.
- **Node 26 / npm.** No bun, pnpm, or yarn on this machine.
- **Ids are permanent.** USDA ingredients use `usda:<fdcId>`; user-created records use a device-generated UUID.

## A note for the implementer

This plan is written for someone new to programming. Every step shows the actual code. Do not skip Step 2 of any task — running the test and **watching it fail** is what proves the test is real. A test that passes before the implementation exists is testing nothing.

---

### Task 1: Project scaffolding, test runner, and the domain boundary

**Files:**
- Create: whole Expo project skeleton
- Create: `eslint.config.js`
- Create: `src/domain/.boundary-check.ts` (temporary, deleted in Step 6)
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npx jest` command; an ESLint rule that fails on UI imports inside `src/domain/`

- [ ] **Step 1: Read the Expo setup rules first**

Invoke the `expo:expo-overview` skill. It carries the current SDK version and shared setup rules. Do **not** pin an SDK version from memory.

- [ ] **Step 2: Scaffold the Expo app**

The directory already contains `.git/` and `docs/`, so scaffolding in place may be refused.

```bash
npx create-expo-app@latest . --template blank-typescript
```

If it refuses because the directory is not empty, scaffold into a temporary sibling directory and copy the files in, preserving `.git/` and `docs/`:

```bash
npx create-expo-app@latest /tmp/mra-scaffold --template blank-typescript
cp -rn /tmp/mra-scaffold/. .
rm -rf /tmp/mra-scaffold
```

- [ ] **Step 3: Install test and lint tooling**

```bash
npm install --save-dev jest jest-expo @types/jest eslint @eslint/js typescript-eslint
```

- [ ] **Step 4: Configure Jest**

Add to `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "lint": "eslint ."
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

- [ ] **Step 5: Configure the domain boundary rule**

Create `eslint.config.js`:

```js
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-*', 'react-native', 'expo', 'expo-*', '@expo/*'],
          message: 'src/domain must stay free of UI and platform dependencies.',
        }],
      }],
    },
  },
  { ignores: ['node_modules/', '.expo/', 'dist/'] },
);
```

- [ ] **Step 6: Prove the boundary rule actually fires**

This is the test for Step 5. Create `src/domain/.boundary-check.ts`:

```ts
import { View } from 'react-native';
export const shouldNotLint = View;
```

Run: `npm run lint`
Expected: FAIL, reporting `src/domain must stay free of UI and platform dependencies.`

A lint rule you never saw fail is a lint rule you cannot trust. Once you have seen the error, delete the file:

```bash
rm src/domain/.boundary-check.ts
```

- [ ] **Step 7: Verify lint now passes**

Run: `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo app with Jest and domain boundary lint"
```

---

### Task 2: The Result type

**Files:**
- Create: `src/domain/result.ts`
- Test: `src/domain/result.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Result<T, E>`, `AppError`, `ok(value)`, `err(error)` — used by every task that follows

- [ ] **Step 1: Write the failing test**

Create `src/domain/result.test.ts`:

```ts
import { ok, err, type Result } from './result';

describe('Result', () => {
  it('wraps a success value', () => {
    const r: Result<number> = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('wraps an error', () => {
    const r: Result<number> = err({ code: 'INVALID_AMOUNT', amount: -1 });
    expect(r).toEqual({ ok: false, error: { code: 'INVALID_AMOUNT', amount: -1 } });
  });

  it('narrows the type when ok is checked', () => {
    const r: Result<number> = ok(10);
    if (r.ok) {
      expect(r.value + 1).toBe(11);
    } else {
      throw new Error('expected ok');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/result.test.ts`
Expected: FAIL — `Cannot find module './result'`

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/result.ts`:

```ts
import type { Unit } from './units/types';

export type AppError =
  | { code: 'NO_PORTION_DATA'; ingredientId: string; unit: Unit }
  | { code: 'INGREDIENT_NOT_FOUND'; ingredientId: string }
  | { code: 'RECIPE_NOT_FOUND'; recipeId: string }
  | { code: 'INVALID_AMOUNT'; amount: number };

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

**Ordering note:** this imports `Unit` from `src/domain/units/types.ts`, which Task 3 creates. That file has no dependencies of its own, so create it now — copy it verbatim from Task 3, Step 3. Task 3 will then find it already present and move on to the ingredient types.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/result.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/result.ts src/domain/result.test.ts
git commit -m "feat(domain): add Result type and AppError union"
```

---

### Task 3: Unit and ingredient types, plus test fixtures

**Files:**
- Create: `src/domain/units/types.ts`
- Create: `src/domain/ingredients/types.ts`
- Create: `src/domain/testing/fixtures.ts`
- Test: `src/domain/ingredients/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Unit`, `Quantity`, `Nutrition`, `Portion`, `Ingredient`; fixtures `oats`, `onion`, `water`

- [ ] **Step 1: Write the failing test**

Create `src/domain/ingredients/types.test.ts`:

```ts
import { oats, onion } from '../testing/fixtures';

describe('fixtures', () => {
  it('oats have a volume portion usable for conversion', () => {
    const volumePortion = oats.portions.find((p) => p.unit.kind === 'volume');
    expect(volumePortion).toBeDefined();
    expect(volumePortion!.gramsPerUnit).toBe(80);
  });

  it('onion has a count portion labelled medium', () => {
    const countPortion = onion.portions.find(
      (p) => p.unit.kind === 'count' && p.unit.label === 'medium',
    );
    expect(countPortion).toBeDefined();
    expect(countPortion!.gramsPerUnit).toBe(110);
  });

  it('nutrition is expressed per 100 g', () => {
    expect(oats.nutritionPer100g.kcal).toBe(389);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/ingredients/types.test.ts`
Expected: FAIL — `Cannot find module '../testing/fixtures'`

- [ ] **Step 3: Write the types**

Create `src/domain/units/types.ts`:

```ts
export type MassSymbol = 'g' | 'kg' | 'oz' | 'lb';
export type VolumeSymbol = 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz';

export type Unit =
  | { kind: 'mass'; symbol: MassSymbol }
  | { kind: 'volume'; symbol: VolumeSymbol }
  | { kind: 'count'; label: string };

export type Quantity = {
  grams: number;
  input: { amount: number; unit: Unit };
};
```

Create `src/domain/ingredients/types.ts`:

```ts
import type { Unit } from '../units/types';

export type Nutrition = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type Portion = {
  label: string;
  unit: Unit;
  gramsPerUnit: number;
};

export type Ingredient = {
  id: string;
  name: string;
  nutritionPer100g: Nutrition;
  portions: Portion[];
  source: 'usda' | 'user';
};
```

- [ ] **Step 4: Write the fixtures**

Create `src/domain/testing/fixtures.ts`:

```ts
import type { Ingredient } from '../ingredients/types';

export const oats: Ingredient = {
  id: 'usda:169705',
  name: 'Oats, rolled',
  nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  portions: [{ label: 'cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
  source: 'usda',
};

export const onion: Ingredient = {
  id: 'usda:170000',
  name: 'Onion, raw',
  nutritionPer100g: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 },
  portions: [{ label: 'medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 110 }],
  source: 'usda',
};

// Deliberately has NO portions — used to test the NO_PORTION_DATA path.
export const water: Ingredient = {
  id: 'usda:174158',
  name: 'Water',
  nutritionPer100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  portions: [],
  source: 'usda',
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/domain/ingredients/types.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/domain/units src/domain/ingredients src/domain/testing
git commit -m "feat(domain): add unit and ingredient types with test fixtures"
```

---

### Task 4: Mass conversion

**Files:**
- Create: `src/domain/units/convert.ts`
- Test: `src/domain/units/convert.test.ts`

**Interfaces:**
- Consumes: `Result`, `ok`, `err` (Task 2); `Unit` (Task 3); `Ingredient` (Task 3); fixtures (Task 3)
- Produces: `toGrams(amount: number, unit: Unit, ingredient: Ingredient): Result<number>` — the mass branch only

- [ ] **Step 1: Write the failing test**

Create `src/domain/units/convert.test.ts`:

```ts
import { toGrams } from './convert';
import { oats } from '../testing/fixtures';

describe('toGrams — mass', () => {
  it('converts kilograms to grams', () => {
    const r = toGrams(2, { kind: 'mass', symbol: 'kg' }, oats);
    expect(r).toEqual({ ok: true, value: 2000 });
  });

  it('passes grams through unchanged', () => {
    const r = toGrams(150, { kind: 'mass', symbol: 'g' }, oats);
    expect(r).toEqual({ ok: true, value: 150 });
  });

  it('converts pounds using the exact definition', () => {
    const r = toGrams(1, { kind: 'mass', symbol: 'lb' }, oats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(453.59237, 5);
  });

  it('rejects a negative amount', () => {
    const r = toGrams(-5, { kind: 'mass', symbol: 'g' }, oats);
    expect(r).toEqual({ ok: false, error: { code: 'INVALID_AMOUNT', amount: -5 } });
  });
});
```

Mass conversion ignores the ingredient entirely — `oats` is passed only to satisfy the signature. That is the point: mass is the one branch that is universally true.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/units/convert.test.ts`
Expected: FAIL — `Cannot find module './convert'`

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/units/convert.ts`:

```ts
import type { Ingredient } from '../ingredients/types';
import { ok, err, type Result } from '../result';
import type { MassSymbol, Unit } from './types';

const MASS_TO_GRAMS: Record<MassSymbol, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

export function toGrams(
  amount: number,
  unit: Unit,
  ingredient: Ingredient,
): Result<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount });
  }

  if (unit.kind === 'mass') {
    return ok(amount * MASS_TO_GRAMS[unit.symbol]);
  }

  return err({ code: 'NO_PORTION_DATA', ingredientId: ingredient.id, unit });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/units/convert.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/units
git commit -m "feat(domain): convert mass units to grams"
```

---

### Task 5: Volume conversion

**Files:**
- Modify: `src/domain/units/convert.ts`
- Test: `src/domain/units/convert.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: everything from Task 4
- Produces: the volume branch of `toGrams`

- [ ] **Step 1: Write the failing test**

Append to `src/domain/units/convert.test.ts`:

```ts
describe('toGrams — volume', () => {
  it('uses the ingredient\'s own cup weight', () => {
    // oats: 1 cup = 80 g
    const r = toGrams(2, { kind: 'volume', symbol: 'cup' }, oats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(160, 6);
  });

  it('converts a volume unit the ingredient has no portion for', () => {
    // 4 tbsp = 0.25 cup; 0.25 x 80 g = 20 g
    const r = toGrams(4, { kind: 'volume', symbol: 'tbsp' }, oats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(20, 6);
  });

  it('reports NO_PORTION_DATA when the ingredient has no volume portion', () => {
    const { water } = require('../testing/fixtures');
    const unit = { kind: 'volume', symbol: 'cup' } as const;
    const r = toGrams(1, unit, water);
    expect(r).toEqual({
      ok: false,
      error: { code: 'NO_PORTION_DATA', ingredientId: water.id, unit },
    });
  });
});
```

The second test is the important one. We only ever store **one** volume portion per ingredient, because volume-to-volume conversion is universal — tablespoons fall out of the cup entry for free.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/units/convert.test.ts`
Expected: FAIL — the volume tests return `NO_PORTION_DATA` instead of a value.

- [ ] **Step 3: Write minimal implementation**

In `src/domain/units/convert.ts`, add the ratio table and the volume branch:

```ts
import type { MassSymbol, Unit, VolumeSymbol } from './types';

const VOLUME_TO_ML: Record<VolumeSymbol, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  floz: 29.5735295625,
  cup: 236.5882365,
};
```

Insert this branch after the `mass` branch, before the final `return err(...)`:

```ts
  if (unit.kind === 'volume') {
    const portion = ingredient.portions.find((p) => p.unit.kind === 'volume');
    if (!portion || portion.unit.kind !== 'volume') {
      return err({ code: 'NO_PORTION_DATA', ingredientId: ingredient.id, unit });
    }
    const requestedMl = amount * VOLUME_TO_ML[unit.symbol];
    const portionMl = VOLUME_TO_ML[portion.unit.symbol];
    return ok((requestedMl / portionMl) * portion.gramsPerUnit);
  }
```

Dividing two millilitre values cancels the unit system, which is why the US customary cup (236.5882365 ml) versus the US legal cup (240 ml) ambiguity cannot affect the result. Never convert to millilitres and then to grams via an assumed density.

The redundant-looking `portion.unit.kind !== 'volume'` check is there so TypeScript narrows `portion.unit` to the volume variant, making `portion.unit.symbol` type-safe.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/units/convert.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/units
git commit -m "feat(domain): convert volume units via ingredient portion ratios"
```

---

### Task 6: Count conversion

**Files:**
- Modify: `src/domain/units/convert.ts`
- Test: `src/domain/units/convert.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: everything from Task 5
- Produces: the count branch of `toGrams`, completing the function

- [ ] **Step 1: Write the failing test**

Append to `src/domain/units/convert.test.ts`:

```ts
describe('toGrams — count', () => {
  it('multiplies a matching count portion', () => {
    const { onion } = require('../testing/fixtures');
    const r = toGrams(2, { kind: 'count', label: 'medium' }, onion);
    expect(r).toEqual({ ok: true, value: 220 });
  });

  it('reports NO_PORTION_DATA when no label matches', () => {
    const { onion } = require('../testing/fixtures');
    const unit = { kind: 'count', label: 'jumbo' } as const;
    const r = toGrams(1, unit, onion);
    expect(r).toEqual({
      ok: false,
      error: { code: 'NO_PORTION_DATA', ingredientId: onion.id, unit },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/units/convert.test.ts`
Expected: FAIL — the first count test returns `NO_PORTION_DATA` instead of `220`.

- [ ] **Step 3: Write minimal implementation**

Insert this branch after the `volume` branch in `src/domain/units/convert.ts`:

```ts
  if (unit.kind === 'count') {
    const portion = ingredient.portions.find(
      (p) => p.unit.kind === 'count' && p.unit.label === unit.label,
    );
    if (!portion) {
      return err({ code: 'NO_PORTION_DATA', ingredientId: ingredient.id, unit });
    }
    return ok(amount * portion.gramsPerUnit);
  }
```

A count label must match a portion that already exists on the ingredient. Users cannot invent arbitrary labels inline — that is what keeps user-defined units out of v1.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/units/convert.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/units
git commit -m "feat(domain): convert count units via labelled portions"
```

---

### Task 7: Recipe types and macro calculation

**Files:**
- Create: `src/domain/recipes/types.ts`
- Create: `src/domain/recipes/macros.ts`
- Modify: `src/domain/testing/fixtures.ts` (add the `grams` helper and `porridge`)
- Test: `src/domain/recipes/macros.test.ts`

**Interfaces:**
- Consumes: `Nutrition`, `Ingredient` (Task 3); `Result` (Task 2)
- Produces: `Recipe`, `RecipeIngredient`; `calculateMacros(recipe, ingredients): Result<{ total: Nutrition; perServing: Nutrition }>`

- [ ] **Step 1: Add the fixture helper**

Two edits to `src/domain/testing/fixtures.ts`. First add these imports **at the top of the file**, beside the existing `Ingredient` import — imports belong together at the top, never appended at the bottom:

```ts
import type { Quantity } from '../units/types';
import type { Recipe } from '../recipes/types';
```

Then append to the **end** of the file:

```ts
export const grams = (n: number): Quantity => ({
  grams: n,
  input: { amount: n, unit: { kind: 'mass', symbol: 'g' } },
});

export const porridge: Recipe = {
  id: 'recipe-1',
  name: 'Porridge',
  servings: 2,
  ingredients: [{ ingredientId: oats.id, quantity: grams(200) }],
  steps: ['Combine and simmer.'],
};
```

- [ ] **Step 2: Write the failing test**

Create `src/domain/recipes/macros.test.ts`:

```ts
import { calculateMacros } from './macros';
import { oats, onion, porridge, grams } from '../testing/fixtures';
import type { Ingredient } from '../ingredients/types';

const lookup = new Map<string, Ingredient>([[oats.id, oats]]);

describe('calculateMacros', () => {
  it('sums macros across ingredients', () => {
    // 200 g of oats = 2 x the per-100g values
    const r = calculateMacros(porridge, lookup);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total.kcal).toBeCloseTo(778, 6);
      expect(r.value.total.proteinG).toBeCloseTo(33.8, 6);
    }
  });

  it('divides by servings for the per-serving figure', () => {
    const r = calculateMacros(porridge, lookup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.perServing.kcal).toBeCloseTo(389, 6);
  });

  it('reports INGREDIENT_NOT_FOUND when a referenced ingredient is missing', () => {
    const broken = {
      ...porridge,
      ingredients: [{ ingredientId: onion.id, quantity: grams(50) }],
    };
    const r = calculateMacros(broken, lookup);
    expect(r).toEqual({
      ok: false,
      error: { code: 'INGREDIENT_NOT_FOUND', ingredientId: onion.id },
    });
  });

  it('rejects a recipe with zero servings', () => {
    const r = calculateMacros({ ...porridge, servings: 0 }, lookup);
    expect(r).toEqual({ ok: false, error: { code: 'INVALID_AMOUNT', amount: 0 } });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/domain/recipes/macros.test.ts`
Expected: FAIL — `Cannot find module './macros'`

- [ ] **Step 4: Write the types**

Create `src/domain/recipes/types.ts`:

```ts
import type { Quantity } from '../units/types';

export type RecipeIngredient = {
  ingredientId: string;
  quantity: Quantity;
};

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
};
```

- [ ] **Step 5: Write the implementation**

Create `src/domain/recipes/macros.ts`:

```ts
import type { Ingredient, Nutrition } from '../ingredients/types';
import { ok, err, type Result } from '../result';
import type { Recipe } from './types';

const EMPTY: Nutrition = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function calculateMacros(
  recipe: Recipe,
  ingredients: ReadonlyMap<string, Ingredient>,
): Result<{ total: Nutrition; perServing: Nutrition }> {
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount: recipe.servings });
  }

  const total: Nutrition = { ...EMPTY };

  for (const item of recipe.ingredients) {
    const ingredient = ingredients.get(item.ingredientId);
    if (!ingredient) {
      return err({ code: 'INGREDIENT_NOT_FOUND', ingredientId: item.ingredientId });
    }
    const factor = item.quantity.grams / 100;
    const n = ingredient.nutritionPer100g;
    total.kcal += n.kcal * factor;
    total.proteinG += n.proteinG * factor;
    total.carbsG += n.carbsG * factor;
    total.fatG += n.fatG * factor;
  }

  const perServing: Nutrition = {
    kcal: total.kcal / recipe.servings,
    proteinG: total.proteinG / recipe.servings,
    carbsG: total.carbsG / recipe.servings,
    fatG: total.fatG / recipe.servings,
  };

  return ok({ total, perServing });
}
```

The `/ 100` is the whole reason nutrition is stored per 100 g: one division, one place, no ambiguity about the basis.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/domain/recipes/macros.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src/domain/recipes src/domain/testing
git commit -m "feat(domain): calculate recipe and per-serving macros"
```

---

### Task 8: Recipe scaling

**Files:**
- Create: `src/domain/recipes/scale.ts`
- Test: `src/domain/recipes/scale.test.ts`

**Interfaces:**
- Consumes: `Recipe` (Task 7); `Result` (Task 2)
- Produces: `scaleRecipe(recipe: Recipe, desiredServings: number): Result<Recipe>`

- [ ] **Step 1: Write the failing test**

Create `src/domain/recipes/scale.test.ts`:

```ts
import { scaleRecipe } from './scale';
import { porridge } from '../testing/fixtures';

describe('scaleRecipe', () => {
  it('multiplies ingredient grams by the serving ratio', () => {
    // porridge serves 2 with 200 g oats; scaled to 3 servings -> 300 g
    const r = scaleRecipe(porridge, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ingredients[0].quantity.grams).toBeCloseTo(300, 6);
  });

  it('records the new serving count', () => {
    const r = scaleRecipe(porridge, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.servings).toBe(3);
  });

  it('does not mutate the original recipe', () => {
    scaleRecipe(porridge, 3);
    expect(porridge.ingredients[0].quantity.grams).toBe(200);
    expect(porridge.servings).toBe(2);
  });

  it('rejects zero or negative servings', () => {
    expect(scaleRecipe(porridge, 0)).toEqual({
      ok: false,
      error: { code: 'INVALID_AMOUNT', amount: 0 },
    });
  });
});
```

The third test matters more than it looks. Accidentally mutating shared data is one of the most common and hardest-to-find bugs in JavaScript, because the damage shows up somewhere unrelated later.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/recipes/scale.test.ts`
Expected: FAIL — `Cannot find module './scale'`

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/recipes/scale.ts`:

```ts
import { ok, err, type Result } from '../result';
import type { Recipe } from './types';

export function scaleRecipe(recipe: Recipe, desiredServings: number): Result<Recipe> {
  if (!Number.isFinite(desiredServings) || desiredServings <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount: desiredServings });
  }
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount: recipe.servings });
  }

  const factor = desiredServings / recipe.servings;

  return ok({
    ...recipe,
    servings: desiredServings,
    ingredients: recipe.ingredients.map((item) => ({
      ...item,
      quantity: {
        grams: item.quantity.grams * factor,
        input: {
          ...item.quantity.input,
          amount: item.quantity.input.amount * factor,
        },
      },
    })),
  });
}
```

Every level that changes gets its own spread. Spreading only the top level would leave the nested `quantity` objects shared with the original, and the mutation test would catch it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/recipes/scale.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/recipes
git commit -m "feat(domain): scale recipes by serving ratio without mutation"
```

---

### Task 9: Display formatting

**Files:**
- Create: `src/domain/units/format.ts`
- Test: `src/domain/units/format.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `formatGrams(grams: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/domain/units/format.test.ts`:

```ts
import { formatGrams } from './format';

describe('formatGrams', () => {
  it('shows small amounts in grams', () => {
    expect(formatGrams(500)).toBe('500 g');
  });

  it('rounds grams to whole numbers', () => {
    expect(formatGrams(499.6)).toBe('500 g');
  });

  it('switches to kilograms at 1000 g', () => {
    expect(formatGrams(1840)).toBe('1.8 kg');
  });

  it('drops a trailing zero decimal', () => {
    expect(formatGrams(1000)).toBe('1 kg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/units/format.test.ts`
Expected: FAIL — `Cannot find module './format'`

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/units/format.ts`:

```ts
export function formatGrams(grams: number): string {
  if (grams >= 1000) {
    const kg = parseFloat((grams / 1000).toFixed(1));
    return `${kg} kg`;
  }
  return `${Math.round(grams)} g`;
}
```

`parseFloat` on the fixed string is what turns `"1.0"` into `1`, so you get `1 kg` rather than `1.0 kg`.

This is a display concern only. It never touches stored data — grams remain canonical.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/domain/units/format.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/units
git commit -m "feat(domain): format gram totals for display"
```

---

### Task 10: Meal plan types and grocery-list aggregation

**Files:**
- Create: `src/domain/plan/types.ts`
- Create: `src/domain/grocery/types.ts`
- Create: `src/domain/grocery/aggregate.ts`
- Test: `src/domain/grocery/aggregate.test.ts`

**Interfaces:**
- Consumes: `scaleRecipe` (Task 8); `formatGrams` (Task 9); `Recipe` (Task 7); `Ingredient` (Task 3); `Result` (Task 2)
- Produces: `MealPlan`, `PlannedMeal`, `GroceryLine`, `GroceryList`; `buildGroceryList(plan, recipes, ingredients): Result<GroceryList>`

This is the task the whole plan has been building toward.

- [ ] **Step 1: Write the failing test**

Create `src/domain/grocery/aggregate.test.ts`:

```ts
import { buildGroceryList } from './aggregate';
import { oats, onion, porridge, grams } from '../testing/fixtures';
import type { Ingredient } from '../ingredients/types';
import type { Recipe } from '../recipes/types';

const soup: Recipe = {
  id: 'recipe-2',
  name: 'Soup',
  servings: 4,
  ingredients: [
    { ingredientId: oats.id, quantity: grams(100) },
    { ingredientId: onion.id, quantity: grams(220) },
  ],
  steps: ['Simmer everything.'],
};

const recipes = new Map<string, Recipe>([
  [porridge.id, porridge],
  [soup.id, soup],
]);
const ingredients = new Map<string, Ingredient>([
  [oats.id, oats],
  [onion.id, onion],
]);

const plan = {
  id: 'plan-1',
  name: 'Week 1',
  meals: [
    { recipeId: porridge.id, servings: 2 }, // factor 1   -> 200 g oats
    { recipeId: soup.id, servings: 2 },     // factor 0.5 -> 50 g oats, 110 g onion
  ],
};

describe('buildGroceryList', () => {
  it('merges the same ingredient across different recipes', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oatLine = r.value.lines.find((l) => l.ingredientId === oats.id);
    expect(oatLine!.totalGrams).toBeCloseTo(250, 6);
  });

  it('scales each recipe to its planned servings', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const onionLine = r.value.lines.find((l) => l.ingredientId === onion.id);
    expect(onionLine!.totalGrams).toBeCloseTo(110, 6);
  });

  it('formats each line for display', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oatLine = r.value.lines.find((l) => l.ingredientId === oats.id);
    expect(oatLine!.display).toBe('250 g');
  });

  it('sorts lines by ingredient name for a stable shopping order', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lines.map((l) => l.name)).toEqual(['Oats, rolled', 'Onion, raw']);
  });

  it('reports RECIPE_NOT_FOUND when a planned recipe was deleted', () => {
    const brokenPlan = { ...plan, meals: [{ recipeId: 'ghost', servings: 1 }] };
    const r = buildGroceryList(brokenPlan, recipes, ingredients);
    expect(r).toEqual({
      ok: false,
      error: { code: 'RECIPE_NOT_FOUND', recipeId: 'ghost' },
    });
  });

  it('reports INGREDIENT_NOT_FOUND when an ingredient is missing', () => {
    const partial = new Map<string, Ingredient>([[oats.id, oats]]);
    const r = buildGroceryList(plan, recipes, partial);
    expect(r).toEqual({
      ok: false,
      error: { code: 'INGREDIENT_NOT_FOUND', ingredientId: onion.id },
    });
  });

  it('returns an empty list for an empty plan', () => {
    const r = buildGroceryList({ ...plan, meals: [] }, recipes, ingredients);
    expect(r).toEqual({ ok: true, value: { lines: [] } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/domain/grocery/aggregate.test.ts`
Expected: FAIL — `Cannot find module './aggregate'`

- [ ] **Step 3: Write the types**

Create `src/domain/plan/types.ts`:

```ts
export type PlannedMeal = {
  recipeId: string;
  servings: number;
};

export type MealPlan = {
  id: string;
  name: string;
  meals: PlannedMeal[];
};
```

Create `src/domain/grocery/types.ts`:

```ts
export type GroceryLine = {
  ingredientId: string;
  name: string;
  totalGrams: number;
  display: string;
};

export type GroceryList = {
  lines: GroceryLine[];
};
```

- [ ] **Step 4: Write the implementation**

Create `src/domain/grocery/aggregate.ts`:

```ts
import type { Ingredient } from '../ingredients/types';
import type { MealPlan } from '../plan/types';
import type { Recipe } from '../recipes/types';
import { scaleRecipe } from '../recipes/scale';
import { ok, err, type Result } from '../result';
import { formatGrams } from '../units/format';
import type { GroceryLine, GroceryList } from './types';

export function buildGroceryList(
  plan: MealPlan,
  recipes: ReadonlyMap<string, Recipe>,
  ingredients: ReadonlyMap<string, Ingredient>,
): Result<GroceryList> {
  const totals = new Map<string, number>();

  for (const meal of plan.meals) {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe) {
      return err({ code: 'RECIPE_NOT_FOUND', recipeId: meal.recipeId });
    }

    const scaled = scaleRecipe(recipe, meal.servings);
    if (!scaled.ok) {
      return scaled;
    }

    for (const item of scaled.value.ingredients) {
      const running = totals.get(item.ingredientId) ?? 0;
      totals.set(item.ingredientId, running + item.quantity.grams);
    }
  }

  const lines: GroceryLine[] = [];
  for (const [ingredientId, totalGrams] of totals) {
    const ingredient = ingredients.get(ingredientId);
    if (!ingredient) {
      return err({ code: 'INGREDIENT_NOT_FOUND', ingredientId });
    }
    lines.push({
      ingredientId,
      name: ingredient.name,
      totalGrams,
      display: formatGrams(totalGrams),
    });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name));
  return ok({ lines });
}
```

Two things worth noticing. `return scaled` inside the `!scaled.ok` branch propagates a failure without rebuilding it — TypeScript has already narrowed it to the error shape. And recipes and ingredients arrive as lookup maps rather than being fetched inside the function, which is exactly what keeps this pure and lets the test above use plain object literals with no database.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/domain/grocery/aggregate.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/domain/plan src/domain/grocery
git commit -m "feat(domain): aggregate a meal plan into a grocery list"
```

---

### Task 11: Full-suite verification and public entry point

**Files:**
- Create: `src/domain/index.ts`
- Test: run the entire suite

**Interfaces:**
- Consumes: everything
- Produces: `src/domain/index.ts` — the single import surface the `data/` and `ui/` layers will use

- [ ] **Step 1: Write the entry point**

Create `src/domain/index.ts`:

```ts
export type { Unit, Quantity, MassSymbol, VolumeSymbol } from './units/types';
export type { Nutrition, Portion, Ingredient } from './ingredients/types';
export type { Recipe, RecipeIngredient } from './recipes/types';
export type { MealPlan, PlannedMeal } from './plan/types';
export type { GroceryLine, GroceryList } from './grocery/types';
export type { Result, AppError } from './result';

export { ok, err } from './result';
export { toGrams } from './units/convert';
export { formatGrams } from './units/format';
export { calculateMacros } from './recipes/macros';
export { scaleRecipe } from './recipes/scale';
export { buildGroceryList } from './grocery/aggregate';
```

Later layers import from `src/domain` and never reach into its subfolders. That keeps the internal structure free to change.

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS — 34 tests across 7 suites.

- [ ] **Step 3: Verify the domain boundary still holds**

Run: `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/index.ts
git commit -m "feat(domain): add public entry point for the domain layer"
```

---

## Definition of Done

- [ ] `npm test` passes — every domain function has tests covering success and failure paths
- [ ] `npm run lint` passes, and the boundary rule was *observed to fail* in Task 1 Step 6
- [ ] `npx tsc --noEmit` reports no errors
- [ ] No file under `src/domain/` imports React, React Native, or Expo
- [ ] Every exported function returns `Result` for expected failures rather than throwing

## What this plan deliberately does not build

Plan 2 covers the data layer (the USDA import script, the bundled SQLite reader, and the JSON-file recipe repository). Plan 3 covers the UI. Neither is needed for this plan's tests to pass, which is the point — the business logic is complete and proven before any storage or screen exists.

## Follow-up: the highest-risk assumption

Spec section 11 item 4 flags that the volume conversion path depends on USDA supplying at least one volume portion per food. Plan 2 must measure that coverage across the chosen subset early, because poor coverage turns the `NO_PORTION_DATA` prompt from a rare fallback into a frequent interruption and would change the ingredient-search UX.
