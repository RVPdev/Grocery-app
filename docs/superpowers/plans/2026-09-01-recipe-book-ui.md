# Recipe Book UI (Plan 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully working recipe book — browse, create, edit, and delete
recipes, with USDA-backed ingredient search, manual amount entry, the
`NO_PORTION_DATA` learn-a-portion flow, and custom-ingredient creation — as a
standalone, navigable Expo app. This is the first of two UI plans; the planner
and grocery list (Plan 3b) build on top of what this plan ships.

**Architecture:** Expo Router (file-based) for navigation, three new/extended
JSON-backed repositories layered on Plan 2's `jsonFileStore` for meal-plan and
user-ingredient data, one new `resolveIngredient`/`searchAllIngredients` module
that unifies USDA + user + learned-portion data behind a single lookup, and
three React Context providers (`RecipeContext`, `IngredientContext`,
`DraftRecipeContext`) that hold app state and delegate persistence to the data
layer. No new domain logic — every screen calls Plan 1's existing
`toGrams`/`calculateMacros`/`scaleRecipe` functions.

**Tech Stack:** Expo Router, React Context + `useReducer`, plain React Native
`StyleSheet`, `react-test-renderer` (already installed transitively, matching
the project's installed React version exactly) for smoke tests — no new
testing library added.

**Spec:** `docs/superpowers/specs/2026-09-01-plan-3-ui-design.md`
(and its parent, `docs/superpowers/specs/2026-08-29-macro-recipe-app-design.md`)

## Global Constraints

- Domain boundary: nothing under `src/domain/` may import `react`/`react-native`/`expo` (enforced by ESLint `no-restricted-imports` on `src/domain/**/*.ts`, already configured — do not touch `eslint.config.js`).
- `grams` is canonical; `nutritionPer100g` names its basis. Never introduce a second unit of storage.
- Expected failures use `Result`/`AppError` (already defined in `src/domain/result.ts`); only genuine emergencies (disk failure, corrupt JSON) throw.
- Node 26 / npm only — no bun, pnpm, or yarn commands.
- USDA ingredient ids are permanent (`usda:<fdcId>`); user-created ingredients and recipes get a UUID from `expo-crypto`'s `randomUUID` (a new dependency this plan installs). Never mint a second id for something that already has one.
- All user data (recipes, meal plan, user ingredients, learned portions) lives in the single `user-data.json` file via `src/data/store/jsonFileStore.ts` — do not add a second JSON file.
- Route files under `app/` are kebab-case, export a default component, and contain no logic beyond wiring — screen implementations live in `src/ui/screens/`, contexts in `src/ui/context/`. Never co-locate a plain component in `app/`.
- Styling is plain `StyleSheet.create()` — no NativeWind, no component library.
- State is React Context + `useReducer` — no Redux/Zustand.
- Per **AGENTS.md**, "Expo HAS CHANGED": before writing code against any Expo package's API, verify it against the real installed `node_modules/<package>/**/*.d.ts` or the versioned docs at `https://docs.expo.dev/versions/v57.0.0/`, not memory. Every task below that touches an Expo API says so explicitly at the point it matters.
- `ui/` tests are a handful of smoke tests per screen/context, not full TDD (matches the parent spec §9's stated testing distribution) — `data/` tests remain strict RED/GREEN TDD, matching Plan 2's executed pattern.

---

### Task 1: Extend `UserData` and fix the "save wipes other fields" bug

**Files:**
- Modify: `src/data/store/jsonFileStore.ts`
- Modify: `src/data/store/jsonFileStore.test.ts`
- Modify: `src/data/store/recipeRepository.ts`
- Modify: `src/data/store/recipeRepository.test.ts`

**Interfaces:**
- Consumes: `FileIO` (`src/data/store/fileIO.ts`, unchanged), `Recipe` (`src/domain/recipes/types.ts`), `MealPlan` (`src/domain/plan/types.ts`), `Ingredient`, `Portion` (`src/domain/ingredients/types.ts`)
- Produces: `UserData` (extended shape, below) — every later task in this plan reads/writes it through `readUserData`/`writeUserData`, unchanged signatures.

This is the foundation for every other repository in this plan, and it fixes a
real bug: today, `recipeRepository.save`/`delete` rebuild `UserData` as
`{ recipes: [...] }`, which will silently discard any other field once
`UserData` grows. The fix must land before Task 2 adds a second field, or
Task 2's own repository would immediately be at risk of the same bug in
reverse.

- [ ] **Step 1: Write the failing tests for the extended shape**

Replace the existing empty-store and freshness assertions in
`src/data/store/jsonFileStore.test.ts` (they currently expect the pre-extension
`{ recipes: [] }` shape) and add one round-trip test for the new fields:

```typescript
// src/data/store/jsonFileStore.test.ts
// Add these imports at the top, alongside the existing ones:
import type { MealPlan } from '../../domain/plan/types';
import type { Ingredient, Portion } from '../../domain/ingredients/types';

// Replace the existing 'returns an empty store when no file exists yet' test:
it('returns an empty store when no file exists yet', async () => {
  expect(await readUserData(nodeFileIO, dir)).toEqual({
    recipes: [],
    mealPlan: { id: 'default', name: 'This Week', meals: [] },
    userIngredients: [],
    learnedPortions: {},
  });
});

// Replace the existing 'returns a fresh object' test:
it('returns a fresh object on each empty-store read, not a shared reference', async () => {
  const first = await readUserData(nodeFileIO, dir);
  const second = await readUserData(nodeFileIO, dir);
  expect(first).not.toBe(second);
  expect(first.recipes).not.toBe(second.recipes);
  expect(first.mealPlan).not.toBe(second.mealPlan);
  expect(first.mealPlan.meals).not.toBe(second.mealPlan.meals);
  expect(first.userIngredients).not.toBe(second.userIngredients);
  expect(first.learnedPortions).not.toBe(second.learnedPortions);
});

// Update the two existing round-trip tests' literals to the full shape:
// 'round-trips a write through a read' and
// 'overwrites the previous contents on a second write, not appends'
// both currently write/read `{ recipes: [porridge] }` / `{ recipes: [] }` —
// change both literals to the full UserData shape, e.g.:
//   { recipes: [porridge], mealPlan: { id: 'default', name: 'This Week', meals: [] }, userIngredients: [], learnedPortions: {} }

// Add one new test proving the extension actually round-trips real data:
it('round-trips meal plan, user ingredients, and learned portions', async () => {
  const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 2 }] };
  const userIngredient: Ingredient = {
    id: 'user:abc', name: 'Homemade granola', nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
    portions: [], source: 'user',
  };
  const learnedPortion: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };
  await writeUserData(nodeFileIO, dir, {
    recipes: [], mealPlan: plan, userIngredients: [userIngredient],
    learnedPortions: { 'usda:1001': [learnedPortion] },
  });
  const result = await readUserData(nodeFileIO, dir);
  expect(result.mealPlan).toEqual(plan);
  expect(result.userIngredients).toEqual([userIngredient]);
  expect(result.learnedPortions).toEqual({ 'usda:1001': [learnedPortion] });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/data/store/jsonFileStore.test.ts`
Expected: FAIL — `readUserData` still returns the old `{ recipes: [] }` shape.

- [ ] **Step 3: Extend `UserData` and its defaults**

```typescript
// src/data/store/jsonFileStore.ts
import type { Recipe } from '../../domain/recipes/types';
import type { MealPlan } from '../../domain/plan/types';
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';

export type UserData = {
  recipes: Recipe[];
  mealPlan: MealPlan;
  userIngredients: Ingredient[];
  learnedPortions: Record<string, Portion[]>;
};

function emptyUserData(): UserData {
  return {
    recipes: [],
    mealPlan: { id: 'default', name: 'This Week', meals: [] },
    userIngredients: [],
    learnedPortions: {},
  };
}

function userDataPath(dir: string): string {
  return `${dir}/user-data.json`;
}

function tempPath(dir: string): string {
  return `${dir}/user-data.json.tmp`;
}

export async function readUserData(io: FileIO, dir: string): Promise<UserData> {
  const path = userDataPath(dir);
  if (!(await io.exists(path))) {
    return emptyUserData();
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/data/store/jsonFileStore.test.ts`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Write the failing regression test for the save-wipes-fields bug**

```typescript
// src/data/store/recipeRepository.test.ts
// Add to the imports:
import { writeUserData } from './jsonFileStore';
import type { MealPlan } from '../../domain/plan/types';

// Add this test inside the existing describe block:
it('saving a recipe preserves an already-stored plan, user ingredients, and learned portions', async () => {
  const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-2', servings: 3 }] };
  await writeUserData(nodeFileIO, dir, {
    recipes: [soup], mealPlan: plan,
    userIngredients: [{ id: 'user:1', name: 'Custom', nutritionPer100g: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }, portions: [], source: 'user' }],
    learnedPortions: { 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] },
  });
  const repo = createRecipeRepository(nodeFileIO, dir);
  await repo.save(porridge);

  const raw = JSON.parse(await nodeFileIO.readText(`${dir}/user-data.json`));
  expect(raw.mealPlan).toEqual(plan);
  expect(raw.userIngredients).toHaveLength(1);
  expect(raw.learnedPortions).toEqual({ 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest src/data/store/recipeRepository.test.ts`
Expected: FAIL — `mealPlan`/`userIngredients`/`learnedPortions` come back as the
empty defaults because `save` currently rebuilds `UserData` from scratch.

- [ ] **Step 7: Fix `save`/`delete` to preserve every other field**

```typescript
// src/data/store/recipeRepository.ts
export function createRecipeRepository(io: FileIO, dir: string): RecipeRepository {
  return {
    async getAll() {
      const data = await readUserData(io, dir);
      return data.recipes;
    },
    async save(recipe: Recipe) {
      const data = await readUserData(io, dir);
      const others = data.recipes.filter((r) => r.id !== recipe.id);
      await writeUserData(io, dir, { ...data, recipes: [...others, recipe] });
    },
    async delete(id: string) {
      const data = await readUserData(io, dir);
      const remaining = data.recipes.filter((r) => r.id !== id);
      await writeUserData(io, dir, { ...data, recipes: remaining });
    },
  };
}
```

- [ ] **Step 8: Run full test suite to verify everything passes**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 9: Commit**

```bash
git add src/data/store/jsonFileStore.ts src/data/store/jsonFileStore.test.ts src/data/store/recipeRepository.ts src/data/store/recipeRepository.test.ts
git commit -m "feat(data): extend UserData for meal plans, user ingredients, and learned portions"
```

---

### Task 2: `UserIngredientRepository`

**Files:**
- Create: `src/data/store/userIngredientRepository.ts`
- Test: `src/data/store/userIngredientRepository.test.ts`

**Interfaces:**
- Consumes: `readUserData`/`writeUserData`/`UserData` (Task 1), `FileIO`, `Ingredient`
- Produces: `UserIngredientRepository` interface and `createUserIngredientRepository(io, dir)` — consumed by Task 5 (wiring) and Task 8 (`IngredientContext`)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/data/store/userIngredientRepository.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUserIngredientRepository } from './userIngredientRepository';
import type { FileIO } from './fileIO';
import type { Ingredient } from '../../domain/ingredients/types';

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

const granola: Ingredient = {
  id: 'user:1', name: 'Homemade granola',
  nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
  portions: [], source: 'user',
};

const jam: Ingredient = {
  id: 'user:2', name: 'Homemade jam',
  nutritionPer100g: { kcal: 250, proteinG: 0, carbsG: 62, fatG: 0 },
  portions: [], source: 'user',
};

describe('createUserIngredientRepository', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'user-ingredient-repo-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list before anything is saved', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    expect(await repo.getAll()).toEqual([]);
  });

  it('save then getAll returns the saved ingredient', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    await repo.save(granola);
    expect(await repo.getAll()).toEqual([granola]);
  });

  it('saving an existing id overwrites rather than duplicating', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    await repo.save(granola);
    await repo.save({ ...granola, name: 'Homemade granola v2' });
    const all = await repo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Homemade granola v2');
  });

  it('saving a second ingredient preserves the first', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    await repo.save(granola);
    await repo.save(jam);
    expect(await repo.getAll()).toEqual([granola, jam]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/data/store/userIngredientRepository.test.ts`
Expected: FAIL with "Cannot find module './userIngredientRepository'"

- [ ] **Step 3: Implement**

```typescript
// src/data/store/userIngredientRepository.ts
import type { Ingredient } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData } from './jsonFileStore';

export interface UserIngredientRepository {
  getAll(): Promise<Ingredient[]>;
  save(ingredient: Ingredient): Promise<void>;
}

export function createUserIngredientRepository(io: FileIO, dir: string): UserIngredientRepository {
  return {
    async getAll() {
      const data = await readUserData(io, dir);
      return data.userIngredients;
    },
    async save(ingredient: Ingredient) {
      const data = await readUserData(io, dir);
      const others = data.userIngredients.filter((i) => i.id !== ingredient.id);
      await writeUserData(io, dir, { ...data, userIngredients: [...others, ingredient] });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/data/store/userIngredientRepository.test.ts`
Expected: PASS, 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/store/userIngredientRepository.ts src/data/store/userIngredientRepository.test.ts
git commit -m "feat(data): add UserIngredientRepository"
```

---

### Task 3: `LearnedPortionStore`

**Files:**
- Create: `src/data/store/learnedPortionStore.ts`
- Test: `src/data/store/learnedPortionStore.test.ts`

**Interfaces:**
- Consumes: `readUserData`/`writeUserData` (Task 1), `FileIO`, `Portion`
- Produces: `LearnedPortionStore` interface and `createLearnedPortionStore(io, dir)` — consumed by Task 5 (wiring) and Task 8 (`IngredientContext`)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/data/store/learnedPortionStore.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLearnedPortionStore } from './learnedPortionStore';
import type { FileIO } from './fileIO';
import type { Portion } from '../../domain/ingredients/types';

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

const oneCup: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };
const oneMedium: Portion = { label: '1 medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 110 };

describe('createLearnedPortionStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'learned-portion-store-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list for an ingredient with no learned portions', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    expect(await store.getFor('usda:1001')).toEqual([]);
  });

  it('add then getFor returns the learned portion', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    await store.add('usda:1001', oneCup);
    expect(await store.getFor('usda:1001')).toEqual([oneCup]);
  });

  it('adding a second portion for the same ingredient appends, not replaces', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    await store.add('usda:1001', oneCup);
    await store.add('usda:1001', oneMedium);
    expect(await store.getFor('usda:1001')).toEqual([oneCup, oneMedium]);
  });

  it('keeps portions for different ingredients separate', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    await store.add('usda:1001', oneCup);
    await store.add('usda:2002', oneMedium);
    expect(await store.getFor('usda:1001')).toEqual([oneCup]);
    expect(await store.getFor('usda:2002')).toEqual([oneMedium]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/data/store/learnedPortionStore.test.ts`
Expected: FAIL with "Cannot find module './learnedPortionStore'"

- [ ] **Step 3: Implement**

```typescript
// src/data/store/learnedPortionStore.ts
import type { Portion } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData } from './jsonFileStore';

export interface LearnedPortionStore {
  getFor(ingredientId: string): Promise<Portion[]>;
  add(ingredientId: string, portion: Portion): Promise<void>;
}

export function createLearnedPortionStore(io: FileIO, dir: string): LearnedPortionStore {
  return {
    async getFor(ingredientId: string) {
      const data = await readUserData(io, dir);
      return data.learnedPortions[ingredientId] ?? [];
    },
    async add(ingredientId: string, portion: Portion) {
      const data = await readUserData(io, dir);
      const existing = data.learnedPortions[ingredientId] ?? [];
      await writeUserData(io, dir, {
        ...data,
        learnedPortions: { ...data.learnedPortions, [ingredientId]: [...existing, portion] },
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/data/store/learnedPortionStore.test.ts`
Expected: PASS, 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/store/learnedPortionStore.ts src/data/store/learnedPortionStore.test.ts
git commit -m "feat(data): add LearnedPortionStore"
```

---

### Task 4: `resolveIngredient` and `searchAllIngredients`

**Files:**
- Create: `src/data/ingredients.ts`
- Test: `src/data/ingredients.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `Portion` (domain types only — this module takes its USDA/user/learned-portion access as injected functions, so it needs no fs/sqlite in its own tests)
- Produces: `IngredientSources` type, `resolveIngredient(sources, id)`, `searchAllIngredients(sources, query)` — consumed by Task 5 (wiring real sources) and Task 8 (`IngredientContext`)

This is where USDA ids (`usda:<fdcId>`), user ids, and learned portions
converge into one lookup, per the spec's §4 "Ingredient resolution" section —
so screens never decide for themselves which of the three sources an id
belongs to.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/data/ingredients.test.ts
import { resolveIngredient, searchAllIngredients, type IngredientSources } from './ingredients';
import type { Ingredient, Portion } from '../domain/ingredients/types';

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, raw',
  nutritionPer100g: { kcal: 389, proteinG: 17, carbsG: 66, fatG: 7 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 40 }],
  source: 'usda',
};

const granola: Ingredient = {
  id: 'user:1', name: 'Homemade granola',
  nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
  portions: [], source: 'user',
};

const learnedCup: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };

function fakeSources(overrides: Partial<IngredientSources> = {}): IngredientSources {
  return {
    getUsdaIngredient: async (id) => (id === oats.id ? oats : null),
    searchUsdaIngredients: async () => [oats],
    getUserIngredients: async () => [granola],
    getLearnedPortionsFor: async () => [],
    ...overrides,
  };
}

describe('resolveIngredient', () => {
  it('resolves a usda: id from the USDA source', async () => {
    const result = await resolveIngredient(fakeSources(), 'usda:1001');
    expect(result).toEqual(oats);
  });

  it('resolves a user id from the user-ingredients source', async () => {
    const result = await resolveIngredient(fakeSources(), 'user:1');
    expect(result).toEqual(granola);
  });

  it('returns null for a usda: id the USDA source does not know', async () => {
    const result = await resolveIngredient(fakeSources({ getUsdaIngredient: async () => null }), 'usda:9999');
    expect(result).toBeNull();
  });

  it('returns null for a user id not present in user ingredients', async () => {
    const result = await resolveIngredient(fakeSources(), 'user:missing');
    expect(result).toBeNull();
  });

  it('merges learned portions onto a usda: ingredient without mutating the base', async () => {
    const sources = fakeSources({ getLearnedPortionsFor: async (id) => (id === 'usda:1001' ? [learnedCup] : []) });
    const result = await resolveIngredient(sources, 'usda:1001');
    expect(result?.portions).toEqual([oats.portions[0], learnedCup]);
    expect(oats.portions).toHaveLength(1); // base object untouched
  });

  it('merges learned portions onto a user ingredient', async () => {
    const sources = fakeSources({ getLearnedPortionsFor: async (id) => (id === 'user:1' ? [learnedCup] : []) });
    const result = await resolveIngredient(sources, 'user:1');
    expect(result?.portions).toEqual([learnedCup]);
  });
});

describe('searchAllIngredients', () => {
  it('combines USDA results with matching user ingredients', async () => {
    const results = await searchAllIngredients(fakeSources(), 'oat');
    expect(results).toEqual([oats, granola]);
  });

  it('filters user ingredients by a case-insensitive name match', async () => {
    const results = await searchAllIngredients(fakeSources(), 'GRANOLA');
    expect(results.map((i) => i.id)).toEqual(['usda:1001', 'user:1']);
  });

  it('excludes a user ingredient that does not match the query', async () => {
    const sources = fakeSources({ getUserIngredients: async () => [{ ...granola, name: 'Pickled onions' }] });
    const results = await searchAllIngredients(sources, 'granola');
    expect(results).toEqual([oats]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/data/ingredients.test.ts`
Expected: FAIL with "Cannot find module './ingredients'"

- [ ] **Step 3: Implement**

```typescript
// src/data/ingredients.ts
import type { Ingredient, Portion } from '../domain/ingredients/types';

export type IngredientSources = {
  getUsdaIngredient(id: string): Promise<Ingredient | null>;
  searchUsdaIngredients(query: string): Promise<Ingredient[]>;
  getUserIngredients(): Promise<Ingredient[]>;
  getLearnedPortionsFor(ingredientId: string): Promise<Portion[]>;
};

function withLearnedPortions(ingredient: Ingredient, learned: Portion[]): Ingredient {
  if (learned.length === 0) return ingredient;
  return { ...ingredient, portions: [...ingredient.portions, ...learned] };
}

export async function resolveIngredient(
  sources: IngredientSources,
  id: string,
): Promise<Ingredient | null> {
  const learned = await sources.getLearnedPortionsFor(id);
  if (id.startsWith('usda:')) {
    const base = await sources.getUsdaIngredient(id);
    return base ? withLearnedPortions(base, learned) : null;
  }
  const userIngredients = await sources.getUserIngredients();
  const base = userIngredients.find((i) => i.id === id) ?? null;
  return base ? withLearnedPortions(base, learned) : null;
}

export async function searchAllIngredients(
  sources: IngredientSources,
  query: string,
): Promise<Ingredient[]> {
  const [usdaResults, userIngredients] = await Promise.all([
    sources.searchUsdaIngredients(query),
    sources.getUserIngredients(),
  ]);
  const lowerQuery = query.toLowerCase();
  const userMatches = userIngredients.filter((i) => i.name.toLowerCase().includes(lowerQuery));
  return [...usdaResults, ...userMatches];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/data/ingredients.test.ts`
Expected: PASS, 9/9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/ingredients.ts src/data/ingredients.test.ts
git commit -m "feat(data): unify USDA, user, and learned-portion ingredient resolution"
```

---

### Task 5: Wire the new repositories and resolvers into `src/data/index.ts`

**Files:**
- Modify: `src/data/index.ts`

**Interfaces:**
- Consumes: `createUserIngredientRepository` (Task 2), `createLearnedPortionStore` (Task 3), `resolveIngredient`/`searchAllIngredients`/`IngredientSources` (Task 4), `searchIngredients`/`getIngredientById` (already exported from `src/data/usda/database.ts`), `expoFileIO`/`userDataDirectory` (already exported from `src/data/store/expoFileIO.ts`)
- Produces: `createDefaultUserIngredientRepository()`, `createDefaultLearnedPortionStore()`, `defaultIngredientSources: IngredientSources`, bound convenience functions `resolveIngredient(id: string): Promise<Ingredient | null>` and `searchAllIngredients(query: string): Promise<Ingredient[]>` (zero-argument-sources versions — **note the arity difference from Task 4's raw functions of the same name**; UI code in Tasks 8+ imports these from `src/data/index.ts`, never the raw ones from `src/data/ingredients.ts`, which stay import-only for `src/data/ingredients.test.ts`) — consumed by Task 8 (`IngredientContext`)

This task has no tests of its own — it is pure wiring, already covered by
Tasks 1-4's tests plus this project's existing `src/data` suites. Verify by
running the full suite at the end.

- [ ] **Step 1: Add the new imports, defaults, and bound convenience functions**

```typescript
// src/data/index.ts — add these imports alongside the existing ones:
import { createUserIngredientRepository, type UserIngredientRepository } from './store/userIngredientRepository';
import { createLearnedPortionStore, type LearnedPortionStore } from './store/learnedPortionStore';
import {
  resolveIngredient as resolveIngredientWithSources,
  searchAllIngredients as searchAllIngredientsWithSources,
  type IngredientSources,
} from './ingredients';

// Add these exports, after the existing createDefaultRecipeRepository:

export type { UserIngredientRepository } from './store/userIngredientRepository';
export { createUserIngredientRepository } from './store/userIngredientRepository';
export type { LearnedPortionStore } from './store/learnedPortionStore';
export { createLearnedPortionStore } from './store/learnedPortionStore';
export type { IngredientSources } from './ingredients';

export function createDefaultUserIngredientRepository(): UserIngredientRepository {
  return createUserIngredientRepository(expoFileIO, userDataDirectory);
}

export function createDefaultLearnedPortionStore(): LearnedPortionStore {
  return createLearnedPortionStore(expoFileIO, userDataDirectory);
}

const defaultUserIngredientRepository = createDefaultUserIngredientRepository();
const defaultLearnedPortionStore = createDefaultLearnedPortionStore();

export const defaultIngredientSources: IngredientSources = {
  getUsdaIngredient: getIngredientById,
  searchUsdaIngredients: searchIngredients,
  getUserIngredients: () => defaultUserIngredientRepository.getAll(),
  getLearnedPortionsFor: (id) => defaultLearnedPortionStore.getFor(id),
};

// Bound convenience functions — the ones UI code should import.
export async function resolveIngredient(id: string) {
  return resolveIngredientWithSources(defaultIngredientSources, id);
}

export async function searchAllIngredients(query: string) {
  return searchAllIngredientsWithSources(defaultIngredientSources, query);
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, all suites (this task adds no new tests but must not break
anything already passing).

- [ ] **Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/data/index.ts
git commit -m "feat(data): expose default-wired ingredient resolution and new repositories"
```

---

### Task 6: Install and configure Expo Router; remove the default template entry

**Files:**
- Modify: `package.json`
- Modify: `app.json`
- Delete: `App.tsx`
- Delete: `index.ts`
- Create: `app/_layout.tsx`
- Create: `app/index.tsx` (minimal — replaced with the real recipe list in Task 10)
- Create: `src/ui/ErrorBoundary.tsx`
- Test: `src/ui/ErrorBoundary.test.tsx`

**Interfaces:**
- Produces: a booting Expo Router app with one route (`/`) and a top-level error boundary. `app/_layout.tsx`'s provider-wrapping structure is extended in Tasks 7-9 (each adds one Context provider around the same `<Stack />`).

**Before writing any config below:** run `npx expo install expo-router
react-native-safe-area-context react-native-screens expo-linking
expo-constants expo-status-bar`, then check
`node_modules/expo-router/package.json`'s `version` field and skim its
`README.md` for its current SDK-57-era setup instructions (babel/metro
changes, if any). AGENTS.md's "Expo HAS CHANGED" directive applies here more
than anywhere else in this project — the steps below are the current
best-known configuration, but if the installed package's own instructions
disagree, follow the installed package and record the deviation in your task
report the way Plan 2's Task 10 did for `expo-file-system`.

- [ ] **Step 1: Install the packages**

Run: `npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar`

- [ ] **Step 2: Point the app's entry point at Expo Router**

```json
// package.json — change only the "main" field:
"main": "expo-router/entry",
```

- [ ] **Step 3: Remove the default template entry files**

```bash
rm App.tsx index.ts
```

- [ ] **Step 4: Configure `app.json` for file-based routing**

Add `"scheme"` and `"expo-router"` to the existing `plugins` array, and enable
typed routes, without touching the other existing keys (`name`, `slug`,
`ios`, `android`, `web`):

```json
// app.json — inside "expo":
"scheme": "macrorecipeapp",
"plugins": [
  "expo-sqlite",
  "expo-asset",
  "expo-router"
],
"experiments": {
  "typedRoutes": true
}
```

- [ ] **Step 5: Write the failing smoke test for the error boundary**

React error boundaries must be class components — there is no hook
equivalent — because only `componentDidCatch`/`getDerivedStateFromError`
receive render-phase errors from descendants.

```typescript
// src/ui/ErrorBoundary.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ErrorBoundary>
          <Text>All good</Text>
        </ErrorBoundary>,
      );
    });
    expect(tree!.root.findByType(Text).props.children).toBe('All good');
  });

  it('renders a fallback message when a descendant throws', () => {
    const originalConsoleError = console.error;
    console.error = jest.fn(); // React logs the caught error; keep test output clean
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });
    expect(tree!.root.findAllByType(Text)[0].props.children).toEqual(
      expect.stringContaining('Something went wrong'),
    );
    console.error = originalConsoleError;
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest src/ui/ErrorBoundary.test.tsx`
Expected: FAIL with "Cannot find module './ErrorBoundary'"

- [ ] **Step 7: Implement the error boundary**

```typescript
// src/ui/ErrorBoundary.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // eslint-disable-next-line no-console -- last-resort emergency logging per spec §8
    console.error('Unhandled error caught by ErrorBoundary:', error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.message}>Something went wrong. Please restart the app.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest src/ui/ErrorBoundary.test.tsx`
Expected: PASS, 2/2 tests.

- [ ] **Step 9: Create the root layout and the minimal root route**

```typescript
// app/_layout.tsx
import { Stack } from 'expo-router/stack';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <Stack />
    </ErrorBoundary>
  );
}
```

```typescript
// app/index.tsx — minimal for now; Task 10 replaces this with the real recipe list
import { StyleSheet, Text, View } from 'react-native';

export default function RecipesRoute() {
  return (
    <View style={styles.container}>
      <Text>Recipes</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 10: Verify the app boots**

Run: `npx expo start --android` (or `--web` if no Android emulator is
available in this environment) and confirm the app launches to a screen
showing "Recipes" with no red-screen error. This is a manual verification
step — there is no automated test for "the app boots," and it must be done
before trusting any later task's screens to actually render on-device, since
Jest smoke tests never catch a broken Metro/router configuration.

- [ ] **Step 11: Run the full test suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean. (`npm test` will now also need `app/` and `src/ui/`
included — confirm Jest picks them up automatically via the existing
`jest-expo` preset; it does not require a config change, since Jest's default
`testMatch` already covers any `*.test.ts(x)` file in the project.)

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json app.json app/ src/ui/ErrorBoundary.tsx src/ui/ErrorBoundary.test.tsx
git rm App.tsx index.ts
git commit -m "feat(ui): install Expo Router and add the root layout with an error boundary"
```

---

### Task 7: `RecipeContext`

**Files:**
- Create: `src/ui/context/RecipeContext.tsx`
- Test: `src/ui/context/RecipeContext.test.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `RecipeRepository`, `createDefaultRecipeRepository` (already exported from `src/data/index.ts`), `Recipe` (`src/domain/recipes/types.ts`)
- Produces: `RecipeProvider` component, `useRecipes()` hook returning `{ recipes: Recipe[]; loading: boolean; addOrUpdateRecipe(recipe: Recipe): Promise<void>; deleteRecipe(id: string): Promise<void> }` — consumed by Tasks 10-12 (recipe screens)

The reducer is a pure function, tested directly without rendering anything —
this is the "TDD-able part" of an otherwise UI-layer task. The provider
itself gets one smoke test confirming it loads from the repository on mount
and that its actions call through to the repository.

- [ ] **Step 1: Write the failing reducer tests**

```typescript
// src/ui/context/RecipeContext.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { recipeReducer, RecipeProvider, useRecipes } from './RecipeContext';
import type { RecipeRepository } from '../../data/index';
import type { Recipe } from '../../domain/recipes/types';

const porridge: Recipe = { id: 'recipe-1', name: 'Porridge', servings: 2, ingredients: [], steps: [] };
const soup: Recipe = { id: 'recipe-2', name: 'Soup', servings: 4, ingredients: [], steps: [] };

describe('recipeReducer', () => {
  it('SET_ALL replaces the list', () => {
    const state = recipeReducer({ recipes: [], loading: true }, { type: 'SET_ALL', recipes: [porridge] });
    expect(state).toEqual({ recipes: [porridge], loading: false });
  });

  it('UPSERT adds a new recipe', () => {
    const state = recipeReducer({ recipes: [porridge], loading: false }, { type: 'UPSERT', recipe: soup });
    expect(state.recipes).toEqual([porridge, soup]);
  });

  it('UPSERT replaces an existing recipe by id rather than duplicating', () => {
    const updated = { ...porridge, name: 'Porridge v2' };
    const state = recipeReducer({ recipes: [porridge, soup], loading: false }, { type: 'UPSERT', recipe: updated });
    expect(state.recipes).toEqual([updated, soup]);
  });

  it('REMOVE deletes only the targeted recipe', () => {
    const state = recipeReducer({ recipes: [porridge, soup], loading: false }, { type: 'REMOVE', id: porridge.id });
    expect(state.recipes).toEqual([soup]);
  });
});

function fakeRepository(initial: Recipe[]): RecipeRepository & { saved: Recipe[]; deleted: string[] } {
  const saved: Recipe[] = [];
  const deleted: string[] = [];
  return {
    saved,
    deleted,
    async getAll() {
      return initial;
    },
    async save(recipe: Recipe) {
      saved.push(recipe);
    },
    async delete(id: string) {
      deleted.push(id);
    },
  };
}

describe('RecipeProvider', () => {
  it('loads recipes from the repository on mount', async () => {
    const repo = fakeRepository([porridge]);
    let tree: renderer.ReactTestRenderer;
    function Consumer() {
      const { recipes, loading } = useRecipes();
      return <Text>{loading ? 'loading' : recipes.map((r) => r.name).join(',')}</Text>;
    }
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={repo}>
          <Consumer />
        </RecipeProvider>,
      );
    });
    expect(tree!.root.findByType(Text).props.children).toBe('Porridge');
  });

  it('addOrUpdateRecipe calls repository.save and updates state', async () => {
    const repo = fakeRepository([]);
    let hookResult: ReturnType<typeof useRecipes>;
    function Consumer() {
      hookResult = useRecipes();
      return null;
    }
    await act(async () => {
      renderer.create(
        <RecipeProvider repository={repo}>
          <Consumer />
        </RecipeProvider>,
      );
    });
    await act(async () => {
      await hookResult!.addOrUpdateRecipe(porridge);
    });
    expect(repo.saved).toEqual([porridge]);
    expect(hookResult!.recipes).toEqual([porridge]);
  });

  it('deleteRecipe calls repository.delete and updates state', async () => {
    const repo = fakeRepository([porridge]);
    let hookResult: ReturnType<typeof useRecipes>;
    function Consumer() {
      hookResult = useRecipes();
      return null;
    }
    await act(async () => {
      renderer.create(
        <RecipeProvider repository={repo}>
          <Consumer />
        </RecipeProvider>,
      );
    });
    await act(async () => {
      await hookResult!.deleteRecipe(porridge.id);
    });
    expect(repo.deleted).toEqual([porridge.id]);
    expect(hookResult!.recipes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/ui/context/RecipeContext.test.tsx`
Expected: FAIL with "Cannot find module './RecipeContext'"

- [ ] **Step 3: Implement**

```typescript
// src/ui/context/RecipeContext.tsx
import React, { createContext, useContext, useEffect, useReducer } from 'react';
import type { Recipe } from '../../domain/recipes/types';
import { createDefaultRecipeRepository, type RecipeRepository } from '../../data/index';

type State = { recipes: Recipe[]; loading: boolean };
type Action =
  | { type: 'SET_ALL'; recipes: Recipe[] }
  | { type: 'UPSERT'; recipe: Recipe }
  | { type: 'REMOVE'; id: string };

export function recipeReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_ALL':
      return { recipes: action.recipes, loading: false };
    case 'UPSERT': {
      const others = state.recipes.filter((r) => r.id !== action.recipe.id);
      return { ...state, recipes: [...others, action.recipe] };
    }
    case 'REMOVE':
      return { ...state, recipes: state.recipes.filter((r) => r.id !== action.id) };
    default:
      return state;
  }
}

type RecipeContextValue = {
  recipes: Recipe[];
  loading: boolean;
  addOrUpdateRecipe(recipe: Recipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
};

const RecipeContext = createContext<RecipeContextValue | null>(null);

type ProviderProps = { children: React.ReactNode; repository?: RecipeRepository };

export function RecipeProvider({ children, repository }: ProviderProps) {
  const repo = repository ?? createDefaultRecipeRepository();
  const [state, dispatch] = useReducer(recipeReducer, { recipes: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    repo.getAll().then((recipes) => {
      if (!cancelled) dispatch({ type: 'SET_ALL', recipes });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- repo is stable for the provider's lifetime
  }, []);

  const value: RecipeContextValue = {
    recipes: state.recipes,
    loading: state.loading,
    async addOrUpdateRecipe(recipe: Recipe) {
      await repo.save(recipe);
      dispatch({ type: 'UPSERT', recipe });
    },
    async deleteRecipe(id: string) {
      await repo.delete(id);
      dispatch({ type: 'REMOVE', id });
    },
  };

  return <RecipeContext.Provider value={value}>{children}</RecipeContext.Provider>;
}

export function useRecipes(): RecipeContextValue {
  const value = useContext(RecipeContext);
  if (!value) throw new Error('useRecipes must be used within a RecipeProvider');
  return value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/context/RecipeContext.test.tsx`
Expected: PASS, 7/7 tests.

- [ ] **Step 5: Wrap the app in `RecipeProvider`**

```typescript
// app/_layout.tsx
import { Stack } from 'expo-router/stack';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RecipeProvider>
        <Stack />
      </RecipeProvider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 6: Run full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/context/RecipeContext.tsx src/ui/context/RecipeContext.test.tsx app/_layout.tsx
git commit -m "feat(ui): add RecipeContext backed by the recipe repository"
```

---

### Task 8: `IngredientContext`

**Files:**
- Create: `src/ui/context/IngredientContext.tsx`
- Test: `src/ui/context/IngredientContext.test.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `resolveIngredient`, `searchAllIngredients`, `createDefaultUserIngredientRepository`, `createDefaultLearnedPortionStore`, `UserIngredientRepository`, `LearnedPortionStore` (all from `src/data/index.ts`, Tasks 2/3/5), `Ingredient`, `Portion`
- Produces: `IngredientProvider`, `useIngredients()` hook returning `{ userIngredients: Ingredient[]; resolve(id: string): Promise<Ingredient | null>; search(query: string): Promise<Ingredient[]>; addUserIngredient(ingredient: Ingredient): Promise<void>; learnPortion(ingredientId: string, portion: Portion): Promise<void> }` — consumed by Tasks 11-13

Unlike `RecipeContext`, `resolve` and `search` don't need cached local state —
they call straight through to the data layer's already-composed
`resolveIngredient`/`searchAllIngredients` on every call (USDA search is a
SQLite query, not something to duplicate in memory). Only `userIngredients`
(needed for the "list what I've added" case, small and infrequently written)
and the learned-portions bookkeeping are cached and kept fresh via the
reducer, since `learnPortion`'s effect (a newly available unit in the amount
picker) needs to show up immediately without a re-fetch.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/ui/context/IngredientContext.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { IngredientProvider, useIngredients } from './IngredientContext';
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import type { UserIngredientRepository, LearnedPortionStore } from '../../data/index';

const granola: Ingredient = {
  id: 'user:1', name: 'Homemade granola',
  nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
  portions: [], source: 'user',
};

const learnedCup: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };

function fakeUserIngredientRepo(initial: Ingredient[]): UserIngredientRepository & { saved: Ingredient[] } {
  const saved: Ingredient[] = [];
  return {
    saved,
    async getAll() {
      return initial;
    },
    async save(ingredient) {
      saved.push(ingredient);
    },
  };
}

function fakeLearnedPortionStore(): LearnedPortionStore & { added: Array<{ id: string; portion: Portion }> } {
  const added: Array<{ id: string; portion: Portion }> = [];
  return {
    added,
    async getFor() {
      return [];
    },
    async add(ingredientId, portion) {
      added.push({ id: ingredientId, portion });
    },
  };
}

describe('IngredientProvider', () => {
  it('loads user ingredients from the repository on mount', async () => {
    const userIngredientRepo = fakeUserIngredientRepo([granola]);
    let hookResult: ReturnType<typeof useIngredients>;
    function Consumer() {
      hookResult = useIngredients();
      return null;
    }
    await act(async () => {
      renderer.create(
        <IngredientProvider userIngredientRepository={userIngredientRepo} learnedPortionStore={fakeLearnedPortionStore()}>
          <Consumer />
        </IngredientProvider>,
      );
    });
    expect(hookResult!.userIngredients).toEqual([granola]);
  });

  it('addUserIngredient saves to the repository and updates state', async () => {
    const userIngredientRepo = fakeUserIngredientRepo([]);
    let hookResult: ReturnType<typeof useIngredients>;
    function Consumer() {
      hookResult = useIngredients();
      return null;
    }
    await act(async () => {
      renderer.create(
        <IngredientProvider userIngredientRepository={userIngredientRepo} learnedPortionStore={fakeLearnedPortionStore()}>
          <Consumer />
        </IngredientProvider>,
      );
    });
    await act(async () => {
      await hookResult!.addUserIngredient(granola);
    });
    expect(userIngredientRepo.saved).toEqual([granola]);
    expect(hookResult!.userIngredients).toEqual([granola]);
  });

  it('learnPortion adds to the store and is reflected in a subsequent resolve', async () => {
    const learnedPortionStore = fakeLearnedPortionStore();
    let hookResult: ReturnType<typeof useIngredients>;
    function Consumer() {
      hookResult = useIngredients();
      return null;
    }
    await act(async () => {
      renderer.create(
        <IngredientProvider userIngredientRepository={fakeUserIngredientRepo([])} learnedPortionStore={learnedPortionStore}>
          <Consumer />
        </IngredientProvider>,
      );
    });
    await act(async () => {
      await hookResult!.learnPortion('usda:1001', learnedCup);
    });
    expect(learnedPortionStore.added).toEqual([{ id: 'usda:1001', portion: learnedCup }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/ui/context/IngredientContext.test.tsx`
Expected: FAIL with "Cannot find module './IngredientContext'"

- [ ] **Step 3: Implement**

```typescript
// src/ui/context/IngredientContext.tsx
import React, { createContext, useContext, useEffect, useReducer } from 'react';
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import {
  resolveIngredient as resolveIngredientDefault,
  searchAllIngredients as searchAllIngredientsDefault,
  createDefaultUserIngredientRepository,
  createDefaultLearnedPortionStore,
  type UserIngredientRepository,
  type LearnedPortionStore,
} from '../../data/index';

type State = { userIngredients: Ingredient[] };
type Action = { type: 'SET_USER_INGREDIENTS'; ingredients: Ingredient[] } | { type: 'ADD_USER_INGREDIENT'; ingredient: Ingredient };

function ingredientReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_USER_INGREDIENTS':
      return { userIngredients: action.ingredients };
    case 'ADD_USER_INGREDIENT':
      return { userIngredients: [...state.userIngredients, action.ingredient] };
    default:
      return state;
  }
}

type IngredientContextValue = {
  userIngredients: Ingredient[];
  resolve(id: string): Promise<Ingredient | null>;
  search(query: string): Promise<Ingredient[]>;
  addUserIngredient(ingredient: Ingredient): Promise<void>;
  learnPortion(ingredientId: string, portion: Portion): Promise<void>;
};

const IngredientContext = createContext<IngredientContextValue | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  userIngredientRepository?: UserIngredientRepository;
  learnedPortionStore?: LearnedPortionStore;
};

export function IngredientProvider({ children, userIngredientRepository, learnedPortionStore }: ProviderProps) {
  const userIngredientRepo = userIngredientRepository ?? createDefaultUserIngredientRepository();
  const learnedPortions = learnedPortionStore ?? createDefaultLearnedPortionStore();
  const [state, dispatch] = useReducer(ingredientReducer, { userIngredients: [] });

  useEffect(() => {
    let cancelled = false;
    userIngredientRepo.getAll().then((ingredients) => {
      if (!cancelled) dispatch({ type: 'SET_USER_INGREDIENTS', ingredients });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- repo is stable for the provider's lifetime
  }, []);

  const value: IngredientContextValue = {
    userIngredients: state.userIngredients,
    resolve: (id) => resolveIngredientDefault(id),
    search: (query) => searchAllIngredientsDefault(query),
    async addUserIngredient(ingredient: Ingredient) {
      await userIngredientRepo.save(ingredient);
      dispatch({ type: 'ADD_USER_INGREDIENT', ingredient });
    },
    async learnPortion(ingredientId: string, portion: Portion) {
      await learnedPortions.add(ingredientId, portion);
    },
  };

  return <IngredientContext.Provider value={value}>{children}</IngredientContext.Provider>;
}

export function useIngredients(): IngredientContextValue {
  const value = useContext(IngredientContext);
  if (!value) throw new Error('useIngredients must be used within an IngredientProvider');
  return value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/context/IngredientContext.test.tsx`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Wrap the app in `IngredientProvider`**

```typescript
// app/_layout.tsx
import { Stack } from 'expo-router/stack';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';
import { IngredientProvider } from '../src/ui/context/IngredientContext';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RecipeProvider>
        <IngredientProvider>
          <Stack />
        </IngredientProvider>
      </RecipeProvider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 6: Run full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/context/IngredientContext.tsx src/ui/context/IngredientContext.test.tsx app/_layout.tsx
git commit -m "feat(ui): add IngredientContext for search, resolution, and learned portions"
```

---

### Task 9: `DraftRecipeContext` and `expo-crypto` id generation

**Files:**
- Create: `src/ui/context/DraftRecipeContext.tsx`
- Test: `src/ui/context/DraftRecipeContext.test.tsx`
- Modify: `app/_layout.tsx`
- Modify: `package.json` (adds `expo-crypto`)

**Interfaces:**
- Consumes: `Recipe`, `RecipeIngredient` (`src/domain/recipes/types.ts`), `Quantity` (`src/domain/units/types.ts`), `randomUUID` from `expo-crypto`
- Produces: `DraftIngredientLine` type, `DraftRecipeProvider`, `useDraftRecipe()` hook returning `{ draft: DraftRecipe; startNew(): void; startEditing(recipe: Recipe, lines: DraftIngredientLine[]): void; setName(name: string): void; setServings(servings: number): void; setSteps(steps: string[]): void; addIngredientLine(line: DraftIngredientLine): void; removeIngredientLine(ingredientId: string): void; buildRecipe(): Recipe }` — consumed by Task 12 (recipe edit screen) and Task 13 (add-ingredient flow)

This is the in-progress, not-yet-saved state of "the recipe currently being
edited," shared between the edit screen and the add-ingredient modal it
pushes — per the spec's screen list, the modal is a step inside editing a
recipe, not an independent destination, so it needs to read and write the
same draft. `DraftIngredientLine` carries `ingredientName` alongside the id
so the edit screen can list ingredients without re-resolving each one on
every render.

**Before writing code:** verify `randomUUID` is exported from the installed
`expo-crypto` version's top-level module (check
`node_modules/expo-crypto/build/Crypto.d.ts` or its README) rather than
assuming the spec's cited API surface is unchanged, per AGENTS.md.

- [ ] **Step 1: Install `expo-crypto`**

Run: `npx expo install expo-crypto`

- [ ] **Step 2: Write the failing reducer and hook tests**

```typescript
// src/ui/context/DraftRecipeContext.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { draftReducer, DraftRecipeProvider, useDraftRecipe, type DraftIngredientLine } from './DraftRecipeContext';
import type { Recipe } from '../../domain/recipes/types';

const oatsLine: DraftIngredientLine = {
  ingredientId: 'usda:1001', ingredientName: 'Oats, raw',
  quantity: { grams: 80, input: { amount: 80, unit: { kind: 'mass', symbol: 'g' } } },
};

describe('draftReducer', () => {
  const empty = { id: null, name: '', servings: 1, steps: [], ingredientLines: [] };

  it('START_NEW resets to an empty draft', () => {
    const state = draftReducer({ id: 'x', name: 'old', servings: 4, steps: ['a'], ingredientLines: [oatsLine] }, { type: 'START_NEW' });
    expect(state).toEqual(empty);
  });

  it('START_EDITING seeds the draft from a recipe and its resolved lines', () => {
    const recipe: Recipe = { id: 'recipe-1', name: 'Porridge', servings: 2, ingredients: [{ ingredientId: oatsLine.ingredientId, quantity: oatsLine.quantity }], steps: ['Simmer.'] };
    const state = draftReducer(empty, { type: 'START_EDITING', recipe, lines: [oatsLine] });
    expect(state).toEqual({ id: 'recipe-1', name: 'Porridge', servings: 2, steps: ['Simmer.'], ingredientLines: [oatsLine] });
  });

  it('SET_NAME/SET_SERVINGS/SET_STEPS update their field only', () => {
    let state = draftReducer(empty, { type: 'SET_NAME', name: 'Porridge' });
    state = draftReducer(state, { type: 'SET_SERVINGS', servings: 4 });
    state = draftReducer(state, { type: 'SET_STEPS', steps: ['Step 1'] });
    expect(state).toEqual({ ...empty, name: 'Porridge', servings: 4, steps: ['Step 1'] });
  });

  it('ADD_INGREDIENT_LINE appends a line', () => {
    const state = draftReducer(empty, { type: 'ADD_INGREDIENT_LINE', line: oatsLine });
    expect(state.ingredientLines).toEqual([oatsLine]);
  });

  it('REMOVE_INGREDIENT_LINE removes only the targeted line', () => {
    const secondLine: DraftIngredientLine = { ...oatsLine, ingredientId: 'usda:2002', ingredientName: 'Milk' };
    const withTwo = draftReducer(empty, { type: 'ADD_INGREDIENT_LINE', line: oatsLine });
    const withBoth = draftReducer(withTwo, { type: 'ADD_INGREDIENT_LINE', line: secondLine });
    const state = draftReducer(withBoth, { type: 'REMOVE_INGREDIENT_LINE', ingredientId: oatsLine.ingredientId });
    expect(state.ingredientLines).toEqual([secondLine]);
  });
});

describe('DraftRecipeProvider', () => {
  it('buildRecipe assigns a new UUID id when the draft has none', async () => {
    let hookResult: ReturnType<typeof useDraftRecipe>;
    function Consumer() {
      hookResult = useDraftRecipe();
      return null;
    }
    await act(async () => {
      renderer.create(
        <DraftRecipeProvider>
          <Consumer />
        </DraftRecipeProvider>,
      );
    });
    act(() => {
      hookResult!.startNew();
      hookResult!.setName('Porridge');
      hookResult!.setServings(2);
      hookResult!.setSteps(['Simmer.']);
      hookResult!.addIngredientLine(oatsLine);
    });
    const recipe = hookResult!.buildRecipe();
    expect(recipe.id).toEqual(expect.any(String));
    expect(recipe.id.length).toBeGreaterThan(0);
    expect(recipe).toEqual({
      id: recipe.id, name: 'Porridge', servings: 2, steps: ['Simmer.'],
      ingredients: [{ ingredientId: oatsLine.ingredientId, quantity: oatsLine.quantity }],
    });
  });

  it('buildRecipe keeps the existing id when editing', async () => {
    let hookResult: ReturnType<typeof useDraftRecipe>;
    function Consumer() {
      hookResult = useDraftRecipe();
      return null;
    }
    const recipe: Recipe = { id: 'recipe-1', name: 'Porridge', servings: 2, ingredients: [], steps: [] };
    await act(async () => {
      renderer.create(
        <DraftRecipeProvider>
          <Consumer />
        </DraftRecipeProvider>,
      );
    });
    act(() => {
      hookResult!.startEditing(recipe, []);
    });
    expect(hookResult!.buildRecipe().id).toBe('recipe-1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest src/ui/context/DraftRecipeContext.test.tsx`
Expected: FAIL with "Cannot find module './DraftRecipeContext'"

- [ ] **Step 4: Implement**

```typescript
// src/ui/context/DraftRecipeContext.tsx
import React, { createContext, useContext, useReducer } from 'react';
import { randomUUID } from 'expo-crypto';
import type { Quantity } from '../../domain/units/types';
import type { Recipe } from '../../domain/recipes/types';

export type DraftIngredientLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: Quantity;
};

type DraftRecipe = {
  id: string | null;
  name: string;
  servings: number;
  steps: string[];
  ingredientLines: DraftIngredientLine[];
};

const EMPTY_DRAFT: DraftRecipe = { id: null, name: '', servings: 1, steps: [], ingredientLines: [] };

type Action =
  | { type: 'START_NEW' }
  | { type: 'START_EDITING'; recipe: Recipe; lines: DraftIngredientLine[] }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_SERVINGS'; servings: number }
  | { type: 'SET_STEPS'; steps: string[] }
  | { type: 'ADD_INGREDIENT_LINE'; line: DraftIngredientLine }
  | { type: 'REMOVE_INGREDIENT_LINE'; ingredientId: string };

export function draftReducer(state: DraftRecipe, action: Action): DraftRecipe {
  switch (action.type) {
    case 'START_NEW':
      return { ...EMPTY_DRAFT, ingredientLines: [] };
    case 'START_EDITING':
      return {
        id: action.recipe.id, name: action.recipe.name, servings: action.recipe.servings,
        steps: action.recipe.steps, ingredientLines: action.lines,
      };
    case 'SET_NAME':
      return { ...state, name: action.name };
    case 'SET_SERVINGS':
      return { ...state, servings: action.servings };
    case 'SET_STEPS':
      return { ...state, steps: action.steps };
    case 'ADD_INGREDIENT_LINE':
      return { ...state, ingredientLines: [...state.ingredientLines, action.line] };
    case 'REMOVE_INGREDIENT_LINE':
      return { ...state, ingredientLines: state.ingredientLines.filter((l) => l.ingredientId !== action.ingredientId) };
    default:
      return state;
  }
}

type DraftRecipeContextValue = {
  draft: DraftRecipe;
  startNew(): void;
  startEditing(recipe: Recipe, lines: DraftIngredientLine[]): void;
  setName(name: string): void;
  setServings(servings: number): void;
  setSteps(steps: string[]): void;
  addIngredientLine(line: DraftIngredientLine): void;
  removeIngredientLine(ingredientId: string): void;
  buildRecipe(): Recipe;
};

const DraftRecipeContext = createContext<DraftRecipeContextValue | null>(null);

export function DraftRecipeProvider({ children }: { children: React.ReactNode }) {
  const [draft, dispatch] = useReducer(draftReducer, EMPTY_DRAFT);

  const value: DraftRecipeContextValue = {
    draft,
    startNew: () => dispatch({ type: 'START_NEW' }),
    startEditing: (recipe, lines) => dispatch({ type: 'START_EDITING', recipe, lines }),
    setName: (name) => dispatch({ type: 'SET_NAME', name }),
    setServings: (servings) => dispatch({ type: 'SET_SERVINGS', servings }),
    setSteps: (steps) => dispatch({ type: 'SET_STEPS', steps }),
    addIngredientLine: (line) => dispatch({ type: 'ADD_INGREDIENT_LINE', line }),
    removeIngredientLine: (ingredientId) => dispatch({ type: 'REMOVE_INGREDIENT_LINE', ingredientId }),
    buildRecipe: () => ({
      id: draft.id ?? randomUUID(),
      name: draft.name,
      servings: draft.servings,
      steps: draft.steps,
      ingredients: draft.ingredientLines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity })),
    }),
  };

  return <DraftRecipeContext.Provider value={value}>{children}</DraftRecipeContext.Provider>;
}

export function useDraftRecipe(): DraftRecipeContextValue {
  const value = useContext(DraftRecipeContext);
  if (!value) throw new Error('useDraftRecipe must be used within a DraftRecipeProvider');
  return value;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/ui/context/DraftRecipeContext.test.tsx`
Expected: PASS, 7/7 tests.

- [ ] **Step 6: Wrap the app in `DraftRecipeProvider`**

```typescript
// app/_layout.tsx
import { Stack } from 'expo-router/stack';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';
import { IngredientProvider } from '../src/ui/context/IngredientContext';
import { DraftRecipeProvider } from '../src/ui/context/DraftRecipeContext';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RecipeProvider>
        <IngredientProvider>
          <DraftRecipeProvider>
            <Stack />
          </DraftRecipeProvider>
        </IngredientProvider>
      </RecipeProvider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 7: Run full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/ui/context/DraftRecipeContext.tsx src/ui/context/DraftRecipeContext.test.tsx app/_layout.tsx
git commit -m "feat(ui): add DraftRecipeContext for in-progress recipe editing"
```

---

### Task 10: Recipe list screen

**Files:**
- Create: `src/ui/screens/RecipeListScreen.tsx`
- Test: `src/ui/screens/RecipeListScreen.test.tsx`
- Modify: `app/index.tsx` (replaces the Task 6 placeholder)

**Interfaces:**
- Consumes: `useRecipes()` (Task 7), `Link`/`useRouter` from `expo-router`
- Produces: `RecipeListScreen` component — the app's root route

- [ ] **Step 1: Write the failing smoke test**

The screen is tested with a fake `RecipeProvider` value via a small test
wrapper, and `expo-router`'s `Link` is mocked so the test never depends on
actual route resolution — only on the screen rendering the right content and
calling the right navigation function.

```typescript
// src/ui/screens/RecipeListScreen.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';
import { RecipeListScreen } from './RecipeListScreen';
import { RecipeProvider } from '../context/RecipeContext';
import type { RecipeRepository } from '../../data/index';
import type { Recipe } from '../../domain/recipes/types';

jest.mock('expo-router', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => children,
}));

const porridge: Recipe = { id: 'recipe-1', name: 'Porridge', servings: 2, ingredients: [], steps: [] };

function fakeRepository(initial: Recipe[]): RecipeRepository {
  return {
    async getAll() {
      return initial;
    },
    async save() {},
    async delete() {},
  };
}

describe('RecipeListScreen', () => {
  it('renders each recipe name', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository([porridge])}>
          <RecipeListScreen />
        </RecipeProvider>,
      );
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names).toContain('Porridge');
  });

  it('renders an empty-state message when there are no recipes', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository([])}>
          <RecipeListScreen />
        </RecipeProvider>,
      );
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names.some((n) => typeof n === 'string' && n.includes('No recipes yet'))).toBe(true);
  });

  it('renders a Pressable per recipe row', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository([porridge])}>
          <RecipeListScreen />
        </RecipeProvider>,
      );
    });
    expect(tree!.root.findAllByType(Pressable)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/screens/RecipeListScreen.test.tsx`
Expected: FAIL with "Cannot find module './RecipeListScreen'"

- [ ] **Step 3: Implement**

```typescript
// src/ui/screens/RecipeListScreen.tsx
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useRecipes } from '../context/RecipeContext';

export function RecipeListScreen() {
  const { recipes, loading } = useRecipes();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {recipes.length === 0 ? (
        <View style={styles.centered}>
          <Text>No recipes yet — add your first one.</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/${item.id}`)}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>{item.servings} servings</Text>
            </Pressable>
          )}
        />
      )}
      <Link href="/new" style={styles.addButton}>
        <Text style={styles.addButtonText}>+ New recipe</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, color: '#666' },
  addButton: { padding: 16, alignItems: 'center' },
  addButtonText: { fontSize: 16, fontWeight: '600' },
});
```

```typescript
// app/index.tsx
import { RecipeListScreen } from '../src/ui/screens/RecipeListScreen';

export default RecipeListScreen;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/screens/RecipeListScreen.test.tsx`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Run full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/RecipeListScreen.tsx src/ui/screens/RecipeListScreen.test.tsx app/index.tsx
git commit -m "feat(ui): add the recipe list screen"
```

---

### Task 11: Recipe detail screen, with `INGREDIENT_NOT_FOUND` handling

**Files:**
- Create: `src/ui/screens/RecipeDetailScreen.tsx`
- Test: `src/ui/screens/RecipeDetailScreen.test.tsx`
- Create: `app/[id].tsx`

**Interfaces:**
- Consumes: `useRecipes()` (Task 7), `useIngredients()` (Task 8), `calculateMacros`, `scaleRecipe` (`src/domain/recipes/macros.ts`, `scale.ts`), `formatGrams` (`src/domain/units/format.ts`), `useLocalSearchParams`/`useRouter` from `expo-router`
- Produces: `RecipeDetailScreen` component, route `/[id]`

Per-serving macros are constant regardless of the "scale for N" control,
since `calculateMacros`'s `perServing` value already divides by the recipe's
own `servings` — the control only changes what `scaleRecipe` returns for
display (the ingredient list at a different batch size). `calculateMacros`
returning `INGREDIENT_NOT_FOUND` (because `resolve` returned `null` for some
ingredient id) is handled per the spec's §5 error table: an inline row with a
"remove from recipe" action, not a crash or a silent drop.

- [ ] **Step 1: Write the failing smoke tests**

```typescript
// src/ui/screens/RecipeDetailScreen.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';
import { RecipeDetailScreen } from './RecipeDetailScreen';
import { RecipeProvider } from '../context/RecipeContext';
import { IngredientProvider } from '../context/IngredientContext';
import type { RecipeRepository, UserIngredientRepository, LearnedPortionStore } from '../../data/index';
import type { Recipe } from '../../domain/recipes/types';
import type { Ingredient } from '../../domain/ingredients/types';

let mockParams = { id: 'recipe-1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, raw',
  nutritionPer100g: { kcal: 389, proteinG: 17, carbsG: 66, fatG: 7 }, portions: [], source: 'usda',
};

const porridge: Recipe = {
  id: 'recipe-1', name: 'Porridge', servings: 2,
  ingredients: [{ ingredientId: 'usda:1001', quantity: { grams: 160, input: { amount: 160, unit: { kind: 'mass', symbol: 'g' } } } }],
  steps: ['Simmer.'],
};

function fakeRecipeRepo(initial: Recipe[]): RecipeRepository {
  return { async getAll() { return initial; }, async save() {}, async delete() {} };
}
function fakeUserIngredientRepo(): UserIngredientRepository {
  return { async getAll() { return []; }, async save() {} };
}
function fakeLearnedPortionStore(): LearnedPortionStore {
  return { async getFor() { return []; }, async add() {} };
}

jest.mock('../../data/index', () => {
  const actual = jest.requireActual('../../data/index');
  return { ...actual, resolveIngredient: jest.fn(async (id: string) => (id === 'usda:1001' ? oats : null)) };
});

function renderScreen(recipe: Recipe) {
  return renderer.create(
    <RecipeProvider repository={fakeRecipeRepo([recipe])}>
      <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={fakeLearnedPortionStore()}>
        <RecipeDetailScreen />
      </IngredientProvider>
    </RecipeProvider>,
  );
}

describe('RecipeDetailScreen', () => {
  it('shows the recipe name and per-serving macros once ingredients resolve', async () => {
    mockParams = { id: 'recipe-1' };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen(porridge);
    });
    const text = tree!.root.findAllByType(Text).map((n) => n.props.children).join(' ');
    expect(text).toContain('Porridge');
    expect(text).toContain('kcal');
  });

  it('shows a removable row when an ingredient cannot be resolved', async () => {
    mockParams = { id: 'recipe-1' };
    const broken: Recipe = { ...porridge, ingredients: [{ ingredientId: 'usda:missing', quantity: porridge.ingredients[0].quantity }] };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen(broken);
    });
    const text = tree!.root.findAllByType(Text).map((n) => n.props.children).join(' ');
    expect(text).toContain('ingredient was removed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/ui/screens/RecipeDetailScreen.test.tsx`
Expected: FAIL with "Cannot find module './RecipeDetailScreen'"

- [ ] **Step 3: Implement**

```typescript
// src/ui/screens/RecipeDetailScreen.tsx
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRecipes } from '../context/RecipeContext';
import { useIngredients } from '../context/IngredientContext';
import { calculateMacros } from '../../domain/recipes/macros';
import { scaleRecipe } from '../../domain/recipes/scale';
import { formatGrams } from '../../domain/units/format';
import type { Ingredient } from '../../domain/ingredients/types';
import type { Recipe } from '../../domain/recipes/types';

export function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { recipes, deleteRecipe, addOrUpdateRecipe } = useRecipes();
  const { resolve } = useIngredients();
  const recipe = recipes.find((r) => r.id === id);
  const [ingredientMap, setIngredientMap] = useState<Map<string, Ingredient> | null>(null);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [scaleTo, setScaleTo] = useState<string>('');

  useEffect(() => {
    if (!recipe) return;
    let cancelled = false;
    (async () => {
      const map = new Map<string, Ingredient>();
      const missing: string[] = [];
      for (const item of recipe.ingredients) {
        const resolved = await resolve(item.ingredientId);
        if (resolved) map.set(item.ingredientId, resolved);
        else missing.push(item.ingredientId);
      }
      if (!cancelled) {
        setIngredientMap(map);
        setMissingIds(missing);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve is stable; recipe identity is what matters
  }, [recipe?.id]);

  if (!recipe) {
    return (
      <View style={styles.centered}>
        <Text>Recipe not found.</Text>
      </View>
    );
  }

  if (!ingredientMap) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const macros = calculateMacros(recipe, ingredientMap);
  const parsedScaleTo = Number(scaleTo);
  const scaled: Recipe | null =
    scaleTo !== '' && Number.isFinite(parsedScaleTo) && parsedScaleTo > 0
      ? (() => {
          const result = scaleRecipe(recipe, parsedScaleTo);
          return result.ok ? result.value : null;
        })()
      : recipe;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{recipe.name}</Text>
      <Text>{recipe.servings} servings</Text>

      {macros.ok ? (
        <Text style={styles.macros}>
          Per serving: {Math.round(macros.value.perServing.kcal)} kcal, {Math.round(macros.value.perServing.proteinG)}g
          protein, {Math.round(macros.value.perServing.carbsG)}g carbs, {Math.round(macros.value.perServing.fatG)}g fat
        </Text>
      ) : (
        <Text style={styles.macros}>Macros unavailable until every ingredient below is resolved.</Text>
      )}

      <Text style={styles.sectionHeading}>Scale to</Text>
      <TextInput
        style={styles.input}
        value={scaleTo}
        onChangeText={setScaleTo}
        keyboardType="numeric"
        placeholder={`${recipe.servings}`}
      />

      <Text style={styles.sectionHeading}>Ingredients</Text>
      {scaled?.ingredients.map((item) => {
        const ingredient = ingredientMap.get(item.ingredientId);
        return (
          <Text key={item.ingredientId}>
            {item.quantity.input.amount.toFixed(1)} {'symbol' in item.quantity.input.unit ? item.quantity.input.unit.symbol : item.quantity.input.unit.label}
            {' '}
            {ingredient?.name ?? item.ingredientId} ({formatGrams(item.quantity.grams)})
          </Text>
        );
      })}
      {missingIds.map((missingId) => (
        <View key={missingId} style={styles.missingRow}>
          <Text>An ingredient was removed from this recipe's library.</Text>
          <Pressable
            onPress={async () => {
              const updated = { ...recipe, ingredients: recipe.ingredients.filter((i) => i.ingredientId !== missingId) };
              await addOrUpdateRecipe(updated);
            }}
          >
            <Text>Remove from recipe</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionHeading}>Steps</Text>
      {recipe.steps.map((step, i) => (
        <Text key={i}>{i + 1}. {step}</Text>
      ))}

      <Pressable style={styles.editButton} onPress={() => router.push(`/${recipe.id}/edit`)}>
        <Text>Edit</Text>
      </Pressable>
      <Pressable
        style={styles.deleteButton}
        onPress={async () => {
          await deleteRecipe(recipe.id);
          router.back();
        }}
      >
        <Text>Delete</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  macros: { marginVertical: 8 },
  sectionHeading: { marginTop: 16, fontSize: 16, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, marginVertical: 4 },
  missingRow: { marginVertical: 4 },
  editButton: { marginTop: 24, padding: 12, alignItems: 'center' },
  deleteButton: { padding: 12, alignItems: 'center' },
});
```

```typescript
// app/[id].tsx
import { RecipeDetailScreen } from '../src/ui/screens/RecipeDetailScreen';

export default RecipeDetailScreen;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/screens/RecipeDetailScreen.test.tsx`
Expected: PASS, 2/2 tests.

- [ ] **Step 5: Run full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/RecipeDetailScreen.tsx src/ui/screens/RecipeDetailScreen.test.tsx app/[id].tsx
git commit -m "feat(ui): add the recipe detail screen with scale-to-N and missing-ingredient handling"
```

---

### Task 12: Recipe edit screen (create and edit)

**Files:**
- Create: `src/ui/screens/RecipeEditScreen.tsx`
- Test: `src/ui/screens/RecipeEditScreen.test.tsx`
- Create: `app/new.tsx`
- Create: `app/[id]/edit.tsx`

**Interfaces:**
- Consumes: `useDraftRecipe()` (Task 9), `useRecipes()` (Task 7), `useIngredients()` (Task 8), `useLocalSearchParams`/`useRouter`/`Link` from `expo-router`
- Produces: `RecipeEditScreen` component, routes `/new` and `/[id]/edit`

Both routes render the same screen component; `new.tsx` calls
`startNew()` before rendering, `[id]/edit.tsx` resolves the existing recipe's
ingredient names (via `IngredientContext.resolve`) into `DraftIngredientLine[]`
and calls `startEditing()` before rendering — matching the file-structure
rule that `app/` files are thin wrappers and screen logic lives in
`src/ui/screens/`.

- [ ] **Step 1: Write the failing smoke tests**

```typescript
// src/ui/screens/RecipeEditScreen.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';
import { RecipeEditScreen } from './RecipeEditScreen';
import { RecipeProvider } from '../context/RecipeContext';
import { DraftRecipeProvider } from '../context/DraftRecipeContext';
import type { RecipeRepository } from '../../data/index';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

function fakeRepository(): RecipeRepository & { saved: unknown[] } {
  const saved: unknown[] = [];
  return { saved, async getAll() { return []; }, async save(r) { saved.push(r); }, async delete() {} };
}

function renderScreen(repo: RecipeRepository) {
  return renderer.create(
    <RecipeProvider repository={repo}>
      <DraftRecipeProvider>
        <RecipeEditScreen />
      </DraftRecipeProvider>
    </RecipeProvider>,
  );
}

describe('RecipeEditScreen', () => {
  it('renders name, servings, and steps inputs', () => {
    const tree = renderScreen(fakeRepository());
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThanOrEqual(2);
  });

  it('renders a button that navigates to the add-ingredient flow', () => {
    const tree = renderScreen(fakeRepository());
    const addButton = tree.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Add ingredient'));
    act(() => {
      addButton?.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/add-ingredient');
  });

  it('saving calls the repository with a recipe built from the draft', async () => {
    const repo = fakeRepository();
    const tree = renderScreen(repo);
    const nameInput = tree.root.findAllByType(TextInput)[0];
    act(() => {
      nameInput.props.onChangeText('Porridge');
    });
    const saveButton = tree.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Save'));
    await act(async () => {
      await saveButton?.props.onPress();
    });
    expect(repo.saved).toHaveLength(1);
    expect((repo.saved[0] as { name: string }).name).toBe('Porridge');
    expect(mockBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/ui/screens/RecipeEditScreen.test.tsx`
Expected: FAIL with "Cannot find module './RecipeEditScreen'"

- [ ] **Step 3: Implement**

```typescript
// src/ui/screens/RecipeEditScreen.tsx
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDraftRecipe } from '../context/DraftRecipeContext';
import { useRecipes } from '../context/RecipeContext';

export function RecipeEditScreen() {
  const router = useRouter();
  const { draft, setName, setServings, setSteps, removeIngredientLine, buildRecipe } = useDraftRecipe();
  const { addOrUpdateRecipe } = useRecipes();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={draft.name} onChangeText={setName} placeholder="Recipe name" />

      <Text style={styles.label}>Servings</Text>
      <TextInput
        style={styles.input}
        value={String(draft.servings)}
        onChangeText={(text) => setServings(Number(text) || 1)}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Steps (one per line)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={draft.steps.join('\n')}
        onChangeText={(text) => setSteps(text.split('\n'))}
        multiline
      />

      <Text style={styles.label}>Ingredients</Text>
      {draft.ingredientLines.map((line) => (
        <View key={line.ingredientId} style={styles.ingredientRow}>
          <Text>{line.quantity.input.amount} — {line.ingredientName}</Text>
          <Pressable onPress={() => removeIngredientLine(line.ingredientId)}>
            <Text>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.addIngredientButton} onPress={() => router.push('/add-ingredient')}>
        <Text>Add ingredient</Text>
      </Pressable>

      <Pressable
        style={styles.saveButton}
        onPress={async () => {
          await addOrUpdateRecipe(buildRecipe());
          router.back();
        }}
      >
        <Text>Save</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, marginTop: 4 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  addIngredientButton: { marginTop: 8, padding: 12, alignItems: 'center' },
  saveButton: { marginTop: 24, padding: 12, alignItems: 'center' },
});
```

```typescript
// app/new.tsx
import { useEffect } from 'react';
import { RecipeEditScreen } from '../src/ui/screens/RecipeEditScreen';
import { useDraftRecipe } from '../src/ui/context/DraftRecipeContext';

export default function NewRecipeRoute() {
  const { startNew } = useDraftRecipe();
  useEffect(() => {
    startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run exactly once on mount
  }, []);
  return <RecipeEditScreen />;
}
```

```typescript
// app/[id]/edit.tsx
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RecipeEditScreen } from '../../src/ui/screens/RecipeEditScreen';
import { useDraftRecipe, type DraftIngredientLine } from '../../src/ui/context/DraftRecipeContext';
import { useRecipes } from '../../src/ui/context/RecipeContext';
import { useIngredients } from '../../src/ui/context/IngredientContext';

export default function EditRecipeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes } = useRecipes();
  const { resolve } = useIngredients();
  const { startEditing } = useDraftRecipe();
  const [ready, setReady] = useState(false);
  const recipe = recipes.find((r) => r.id === id);

  useEffect(() => {
    if (!recipe) return;
    let cancelled = false;
    (async () => {
      const lines: DraftIngredientLine[] = [];
      for (const item of recipe.ingredients) {
        const resolved = await resolve(item.ingredientId);
        lines.push({ ingredientId: item.ingredientId, ingredientName: resolved?.name ?? item.ingredientId, quantity: item.quantity });
      }
      if (!cancelled) {
        startEditing(recipe, lines);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve/startEditing are stable; recipe identity is what matters
  }, [recipe?.id]);

  if (!ready) return null;
  return <RecipeEditScreen />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/screens/RecipeEditScreen.test.tsx`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Run full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/RecipeEditScreen.tsx src/ui/screens/RecipeEditScreen.test.tsx app/new.tsx "app/[id]/edit.tsx"
git commit -m "feat(ui): add the recipe create/edit screen"
```

---

### Task 13: Add-ingredient flow (search, custom ingredient, amount entry, learn portion)

**Files:**
- Create: `src/ui/screens/AddIngredientScreen.tsx`
- Test: `src/ui/screens/AddIngredientScreen.test.tsx`
- Create: `app/add-ingredient.tsx`

**Interfaces:**
- Consumes: `useIngredients()` (Task 8), `useDraftRecipe()` (Task 9), `toGrams` (`src/domain/units/convert.ts`), `Unit`, `MassSymbol`, `VolumeSymbol` (`src/domain/units/types.ts`), `Ingredient`, `Portion` (`src/domain/ingredients/types.ts`), `useRouter` from `expo-router`
- Produces: `AddIngredientScreen` component, route `/add-ingredient`

**Design note — one route, four internal steps, not four routes.** The
approved spec (§2) describes ingredient search, custom-ingredient creation,
amount entry, and portion-teaching as separate modals. Implementing them as
four separate pushed routes would require popping a variable number of
screens to return to the edit screen depending on which path the user took
(direct pick vs. custom-ingredient creation vs. an extra portion-teaching
detour) — a correctness risk resting on assumptions about Expo Router's
multi-level dismiss behavior that this project's own AGENTS.md directive
says not to trust from memory. A single route with internal step state avoids
the question entirely: exactly one `router.push('/add-ingredient')` from the
edit screen, exactly one `router.back()` to return, regardless of how many
internal steps the user took. This is a file-structure refinement within
this plan's own authority (per `writing-plans`' "decomposition decisions get
locked in here"), not a scope change — every flow the spec describes is
still built, just as one file instead of four.

Internal steps: `'search' | 'custom-create' | 'amount' | 'learn-portion'`.

- Per the spec §5, the amount step's unit picker offers only mass units
  (`g`/`kg`/`oz`/`lb`, always valid) plus whatever unit kinds the selected
  ingredient's `portions` actually support, with an "other unit" escape
  hatch that reveals the full unit list; picking an unsupported unit from
  there is what leads to the `learn-portion` step.
- On finishing `amount` successfully, the screen calls
  `addIngredientLine(...)` and `router.back()` once.

- [ ] **Step 1: Write the failing smoke tests**

```typescript
// src/ui/screens/AddIngredientScreen.test.tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';
import { AddIngredientScreen } from './AddIngredientScreen';
import { IngredientProvider } from '../context/IngredientContext';
import { DraftRecipeProvider, useDraftRecipe } from '../context/DraftRecipeContext';
import type { UserIngredientRepository, LearnedPortionStore } from '../../data/index';
import type { Ingredient } from '../../domain/ingredients/types';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, raw',
  nutritionPer100g: { kcal: 389, proteinG: 17, carbsG: 66, fatG: 7 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 40 }],
  source: 'usda',
};

function fakeUserIngredientRepo(): UserIngredientRepository {
  return { async getAll() { return []; }, async save() {} };
}
function fakeLearnedPortionStore(): LearnedPortionStore & { added: unknown[] } {
  const added: unknown[] = [];
  return { added, async getFor() { return []; }, async add(...args) { added.push(args); } };
}

jest.mock('../../data/index', () => ({
  ...jest.requireActual('../../data/index'),
  searchAllIngredients: jest.fn(async (query: string) => (query === 'oat' ? [oats] : [])),
}));

function TestHarness({ learnedPortionStore }: { learnedPortionStore: LearnedPortionStore }) {
  return (
    <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={learnedPortionStore}>
      <DraftRecipeProvider>
        <AddIngredientScreen />
      </DraftRecipeProvider>
    </IngredientProvider>
  );
}

describe('AddIngredientScreen', () => {
  it('search step: typing a query and picking a result advances to amount entry, then adding commits the line and goes back', async () => {
    const learnedPortionStore = fakeLearnedPortionStore();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<TestHarness learnedPortionStore={learnedPortionStore} />);
    });

    const searchInput = tree!.root.findByType(TextInput);
    await act(async () => {
      searchInput.props.onChangeText('oat');
    });

    const resultButton = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Oats, raw'));
    act(() => {
      resultButton?.props.onPress();
    });

    // Now on the amount step: mass units are always offered.
    const gramsOption = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'g'));
    act(() => {
      gramsOption?.props.onPress();
    });
    const amountInput = tree!.root.findAllByType(TextInput).find((i) => i.props.keyboardType === 'numeric');
    act(() => {
      amountInput?.props.onChangeText('80');
    });
    const confirmButton = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Add to recipe'));
    await act(async () => {
      await confirmButton?.props.onPress();
    });

    expect(mockBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/screens/AddIngredientScreen.test.tsx`
Expected: FAIL with "Cannot find module './AddIngredientScreen'"

- [ ] **Step 3: Implement**

```typescript
// src/ui/screens/AddIngredientScreen.tsx
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useIngredients } from '../context/IngredientContext';
import { useDraftRecipe } from '../context/DraftRecipeContext';
import { toGrams } from '../../domain/units/convert';
import type { Ingredient } from '../../domain/ingredients/types';
import type { MassSymbol, Unit, VolumeSymbol } from '../../domain/units/types';

type Step = 'search' | 'custom-create' | 'amount' | 'learn-portion';

const MASS_UNITS: MassSymbol[] = ['g', 'kg', 'oz', 'lb'];
const ALL_VOLUME_UNITS: VolumeSymbol[] = ['ml', 'l', 'tsp', 'tbsp', 'cup', 'floz'];

function availableUnits(ingredient: Ingredient): Unit[] {
  const units: Unit[] = MASS_UNITS.map((symbol) => ({ kind: 'mass', symbol }));
  for (const portion of ingredient.portions) {
    if (portion.unit.kind === 'volume' && !units.some((u) => u.kind === 'volume')) {
      units.push(...ALL_VOLUME_UNITS.map((symbol) => ({ kind: 'volume', symbol }) as Unit));
    }
    if (portion.unit.kind === 'count') {
      units.push(portion.unit);
    }
  }
  return units;
}

function unitLabel(unit: Unit): string {
  return unit.kind === 'count' ? unit.label : unit.symbol;
}

export function AddIngredientScreen() {
  const router = useRouter();
  const { search, addUserIngredient, learnPortion } = useIngredients();
  const { addIngredientLine } = useDraftRecipe();

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Ingredient[]>([]);
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [showAllUnits, setShowAllUnits] = useState(false);
  const [chosenUnit, setChosenUnit] = useState<Unit | null>(null);
  const [amountText, setAmountText] = useState('');
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [gramsPerUnitText, setGramsPerUnitText] = useState('');

  async function runSearch(text: string) {
    setQuery(text);
    setResults(text.trim().length === 0 ? [] : await search(text));
  }

  function pickIngredient(ingredient: Ingredient) {
    setSelected(ingredient);
    setChosenUnit(null);
    setShowAllUnits(false);
    setStep('amount');
  }

  function tryConvert(unit: Unit, amount: number) {
    if (!selected) return;
    const result = toGrams(amount, unit, selected);
    if (result.ok) {
      addIngredientLine({
        ingredientId: selected.id,
        ingredientName: selected.name,
        quantity: { grams: result.value, input: { amount, unit } },
      });
      router.back();
      return;
    }
    if (result.error.code === 'NO_PORTION_DATA') {
      setConversionError(null);
      setStep('learn-portion');
      return;
    }
    setConversionError('Enter a positive amount.');
  }

  return (
    <ScrollView style={styles.container}>
      {step === 'search' && (
        <View>
          <TextInput style={styles.input} placeholder="Search ingredients" value={query} onChangeText={runSearch} />
          {results.map((ingredient) => (
            <Pressable key={ingredient.id} style={styles.row} onPress={() => pickIngredient(ingredient)}>
              <Text>{ingredient.name}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.row} onPress={() => setStep('custom-create')}>
            <Text>Can't find it? Add a custom ingredient</Text>
          </Pressable>
        </View>
      )}

      {step === 'custom-create' && (
        <CustomIngredientForm
          onCreated={async (ingredient) => {
            await addUserIngredient(ingredient);
            pickIngredient(ingredient);
          }}
        />
      )}

      {step === 'amount' && selected && (
        <View>
          <Text style={styles.label}>{selected.name}</Text>
          <Text style={styles.label}>Unit</Text>
          {(showAllUnits ? [...MASS_UNITS.map((s) => ({ kind: 'mass', symbol: s }) as Unit), ...ALL_VOLUME_UNITS.map((s) => ({ kind: 'volume', symbol: s }) as Unit)] : availableUnits(selected)).map((unit) => (
            <Pressable key={unitLabel(unit)} style={styles.row} onPress={() => setChosenUnit(unit)}>
              <Text>{unitLabel(unit)}</Text>
            </Pressable>
          ))}
          {!showAllUnits && (
            <Pressable style={styles.row} onPress={() => setShowAllUnits(true)}>
              <Text>Use a different unit</Text>
            </Pressable>
          )}
          {chosenUnit && (
            <View>
              <Text style={styles.label}>Amount ({unitLabel(chosenUnit)})</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={amountText} onChangeText={setAmountText} />
              {conversionError && <Text style={styles.error}>{conversionError}</Text>}
              <Pressable
                style={styles.row}
                onPress={() => {
                  const amount = Number(amountText);
                  if (!Number.isFinite(amount) || amount <= 0) {
                    setConversionError('Enter a positive amount.');
                    return;
                  }
                  tryConvert(chosenUnit, amount);
                }}
              >
                <Text>Add to recipe</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {step === 'learn-portion' && selected && chosenUnit && (
        <View>
          <Text style={styles.label}>
            How many grams is 1 {unitLabel(chosenUnit)} of {selected.name}?
          </Text>
          <TextInput style={styles.input} keyboardType="numeric" value={gramsPerUnitText} onChangeText={setGramsPerUnitText} />
          <Pressable
            style={styles.row}
            onPress={async () => {
              const gramsPerUnit = Number(gramsPerUnitText);
              if (!Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0) return;
              await learnPortion(selected.id, {
                label: unitLabel(chosenUnit),
                unit: chosenUnit,
                gramsPerUnit,
              });
              setStep('amount');
            }}
          >
            <Text>Save and continue</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function CustomIngredientForm({ onCreated }: { onCreated: (ingredient: Ingredient) => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');

  return (
    <View>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      <Text style={styles.label}>Per 100g — kcal / protein / carbs / fat</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={kcal} onChangeText={setKcal} placeholder="kcal" />
      <TextInput style={styles.input} keyboardType="numeric" value={proteinG} onChangeText={setProteinG} placeholder="protein (g)" />
      <TextInput style={styles.input} keyboardType="numeric" value={carbsG} onChangeText={setCarbsG} placeholder="carbs (g)" />
      <TextInput style={styles.input} keyboardType="numeric" value={fatG} onChangeText={setFatG} placeholder="fat (g)" />
      <Pressable
        style={styles.row}
        onPress={() => {
          onCreated({
            id: `user:${randomUUID()}`,
            name,
            nutritionPer100g: {
              kcal: Number(kcal) || 0,
              proteinG: Number(proteinG) || 0,
              carbsG: Number(carbsG) || 0,
              fatG: Number(fatG) || 0,
            },
            portions: [],
            source: 'user',
          });
        }}
      >
        <Text>Create ingredient</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, marginTop: 4 },
  row: { paddingVertical: 10 },
  error: { color: 'red' },
});
```

```typescript
// app/add-ingredient.tsx
import { AddIngredientScreen } from '../src/ui/screens/AddIngredientScreen';

export default AddIngredientScreen;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/screens/AddIngredientScreen.test.tsx`
Expected: PASS, 1/1 test.

- [ ] **Step 5: Run full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/AddIngredientScreen.tsx src/ui/screens/AddIngredientScreen.test.tsx app/add-ingredient.tsx
git commit -m "feat(ui): add the search/custom-ingredient/amount/learn-portion flow"
```

---

### Task 14: Manual end-to-end verification and final whole-plan review

**Files:** none created or modified — this task is verification only.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 2: Manually walk the golden path on a device or emulator**

Run: `npx expo start --android` (or `--web`). Verify, in order:
1. App opens to an empty recipe list with a "+ New recipe" link.
2. Creating a new recipe: enter a name and servings, add an ingredient via
   search (pick any real USDA food, e.g. "banana"), choose grams, enter an
   amount, save the ingredient line, then save the recipe.
3. The recipe now appears in the list; opening it shows correct per-serving
   macros and the ingredient at the entered amount.
4. Edit the recipe, remove the ingredient, add a different one by a unit
   that requires the "use a different unit" escape hatch and triggers the
   learn-a-portion prompt (pick an ingredient known to lack a volume
   portion, or force it by picking "cup" via the escape hatch on an
   ingredient whose available-units list doesn't include volume); confirm
   the app asks for grams-per-cup, accepts it, and the ingredient line is
   added.
5. Re-open the add-ingredient flow for the same ingredient and unit again —
   confirm it's now offered directly (no escape hatch needed), proving the
   learned portion persisted.
6. Delete the recipe; confirm it's gone from the list.
7. Force-quit and reopen the app; confirm the (now-empty) list persisted
   correctly (i.e., the delete actually wrote to disk).

This is the step that catches anything Jest's mocked `expo-router` and fake
repositories cannot: real navigation, real SQLite search, real file
persistence across an app restart. Report any failure found here as a defect
to fix before treating this plan as done — do not skip this step because the
automated suite is green.

- [ ] **Step 3: Report**

If every check in Step 2 passes, this plan is complete. If anything fails,
fix it as its own commit (do not silently patch the task above it), re-run
Steps 1 and 2, and only then consider the plan done.

---

## What Plan 3b Will Need to Change

Not part of this plan, but worth stating so a future reader of `app/_layout.tsx`
isn't surprised: Plan 3b (meal planner + grocery list) will restructure
navigation from this plan's single `Stack` into a `NativeTabs` root with three
tab groups (Recipes, Plan, Grocery), moving every route this plan created —
`app/index.tsx`, `app/[id].tsx`, `app/[id]/edit.tsx`, `app/new.tsx`,
`app/add-ingredient.tsx` — under `app/(tabs)/recipes/`. That restructuring is
Plan 3b's own first task, not this one's.
