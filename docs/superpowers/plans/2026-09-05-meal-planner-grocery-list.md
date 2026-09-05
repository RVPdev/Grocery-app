# Meal Planner + Grocery List (Plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop the app was designed for — let someone assign
recipes and servings to a weekly plan, see per-meal macros, and get an
aggregated grocery list, all backed by persistent storage and reachable via a
3-tab navigation structure (Recipes / Plan / Grocery).

**Architecture:** One new JSON-backed `PlanRepository` (same shape as the
existing `RecipeRepository`) layered on `jsonFileStore.ts` — which this plan
also hardens with a write-serialization lock, since `PlanRepository` is the
5th concurrent writer to the single `user-data.json` file. One new
`PlanContext` (React Context + `useReducer`, same pattern as `RecipeContext`)
holds the active `MealPlan` in memory. Two new screens, `PlanScreen` and
`GroceryScreen`, call Plan 1's existing pure `scaleRecipe`/`calculateMacros`/
`buildGroceryList` — no new domain logic. Navigation moves from a single
`Stack` to `expo-router/unstable-native-tabs`'s `NativeTabs`, with a nested
`Stack` inside each tab (native tabs render no header of their own).

**Tech Stack:** Expo Router (`NativeTabs` from `expo-router/unstable-native-tabs`,
confirmed current for SDK 57 via the `expo-router` skill — see the Global
Constraints note below), React Context + `useReducer`, plain React Native
`StyleSheet`, `react-test-renderer` for smoke tests — no new dependency added.

**Spec:** `docs/superpowers/specs/2026-09-01-plan-3-ui-design.md`, especially
its §9 addendum (2026-09-05), which narrows this plan's actual scope against
what Plan 3a already delivered. Parent spec:
`docs/superpowers/specs/2026-08-29-macro-recipe-app-design.md`.

## Global Constraints

- Domain boundary: nothing under `src/domain/` may import `react`/`react-native`/`expo` (enforced by ESLint `no-restricted-imports` on `src/domain/**/*.ts` — do not touch `eslint.config.js`).
- `grams` is canonical; `nutritionPer100g` names its basis. Never introduce a second unit of storage.
- Expected failures use `Result`/`AppError` (`src/domain/result.ts`); only genuine emergencies (disk failure, corrupt JSON) throw.
- Node 26 / npm only — no bun, pnpm, or yarn commands.
- All user data (recipes, meal plan, user ingredients, learned portions) lives in the single `user-data.json` file via `src/data/store/jsonFileStore.ts` — do not add a second JSON file.
- **New in this plan:** every write to `user-data.json` — present and future — must go through `withUserDataLock` (Task 1). A repository that calls `writeUserData` directly, unlocked, reintroduces the exact race this plan fixes.
- **New in this plan:** `MealPlan.meals` treats `PlannedMeal.recipeId` as a unique key. The domain type (`src/domain/plan/types.ts`) doesn't enforce this, but the UI does: adding a recipe already in the plan is not exposed as a path (the "add to plan" flow only lists recipes not already planned), and `REMOVE_MEAL`/`UPDATE_MEAL_SERVINGS` both key by `recipeId` alone. This keeps a flat, day/slot-less plan (matching the parent spec's "assign recipes and portion counts to a plan," not a calendar) unambiguous.
- Route files under `app/` are kebab-case, export a default component, and contain no logic beyond wiring (and, for a couple of existing routes, a thin `useEffect` that starts/loads draft state) — screen implementations live in `src/ui/screens/`, contexts in `src/ui/context/`. Never co-locate a plain component in `app/`.
- Styling is plain `StyleSheet.create()` — no NativeWind, no component library.
- State is React Context + `useReducer` — no Redux/Zustand.
- Per **AGENTS.md**, "Expo HAS CHANGED": this plan already did the required verification against the current `expo-router` skill (SDK 57 / expo-router ~57.0.18 installed) rather than training-data memory. Confirmed: `NativeTabs` from `expo-router/unstable-native-tabs` is the current, recommended tab API (available since SDK 54); native tabs render no header, so each tab needs its own nested `Stack` for headers/titles, exactly like the existing screens already set via inline `<Stack.Screen options={{ title }} />`. Task 8 uses this API directly — no further verification needed there.
- `ui/` tests are a handful of smoke tests per screen/context (renders without crashing, key interactions fire the right action), not full TDD, matching the parent spec's stated testing distribution — except pure, non-React logic that happens to live under `src/ui/screens/` (this plan's `resolveIngredientsForRecipes.ts`), which gets real TDD like `src/domain/` code does. `data/` tests remain strict RED/GREEN TDD.

---

### Task 1: Fix `jsonFileStore`'s write-concurrency gap

**Files:**
- Modify: `src/data/store/jsonFileStore.ts`
- Modify: `src/data/store/jsonFileStore.test.ts`
- Modify: `src/data/store/recipeRepository.ts`
- Modify: `src/data/store/userIngredientRepository.ts`
- Modify: `src/data/store/learnedPortionStore.ts`

**Interfaces:**
- Consumes: `FileIO` (`src/data/store/fileIO.ts`, unchanged), existing `readUserData`/`writeUserData` (unchanged signatures)
- Produces: `withUserDataLock<T>(operation: () => Promise<T>): Promise<T>` — every later task's `PlanRepository.save` (Task 2), and every write in this task's three modified repositories, wraps its read-modify-write sequence in this function. This is the one thing every future writer to `user-data.json` must use.

`writeUserData` writes to a shared temp path (`user-data.json.tmp`) and renames
it into place. Today, every repository does `read -> modify in memory ->
writeUserData` with no coordination. With one writer this is safe (every call
is awaited before the next starts), but two writers firing without an
`await` between them — e.g. saving a recipe while a plan write is still in
flight — can both read the same snapshot, then each write back a version
missing the other's change (a lost update), or worse, both write the shared
`.tmp` file at once so one writer's rename moves the *other* writer's content
into place. Plan 3b's `PlanRepository` (Task 2) is the 5th writer, which is
what actually makes this reachable in practice (a double-tap adding a meal
while a recipe edit is still saving, for instance) — so it's fixed here,
first, before anything depends on it.

The fix is an in-process async queue: every operation that touches
`user-data.json` chains onto a single promise, so only one read-modify-write
sequence is ever in flight, regardless of which repository triggered it.

- [ ] **Step 1: Write two failing unit tests for the lock's ordering behavior**

```typescript
// src/data/store/jsonFileStore.test.ts — add this describe block
describe('withUserDataLock', () => {
  it('does not start a second operation until the first one resolves', async () => {
    const order: string[] = [];
    let resolveFirst: () => void;

    const first = withUserDataLock(async () => {
      order.push('first-start');
      await new Promise<void>((resolve) => { resolveFirst = resolve; });
      order.push('first-end');
    });
    const second = withUserDataLock(async () => {
      order.push('second-start');
    });

    // Give the microtask queue a couple of ticks — long enough for
    // `second`'s executor to have run already if the lock weren't
    // serializing it behind `first`.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first-start']);

    resolveFirst!();
    await first;
    await second;
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('still runs a queued operation after an earlier one rejects', async () => {
    const order: string[] = [];

    await withUserDataLock(async () => {
      order.push('will-reject');
      throw new Error('boom');
    }).catch(() => {});

    await withUserDataLock(async () => {
      order.push('runs-after');
    });

    expect(order).toEqual(['will-reject', 'runs-after']);
  });
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx jest src/data/store/jsonFileStore.test.ts`
Expected: FAIL — `withUserDataLock is not a function` (it isn't exported
yet).

- [ ] **Step 3: Implement `withUserDataLock`**

```typescript
// src/data/store/jsonFileStore.ts — add near the top, after the imports

// Every repository's read-modify-write sequence against user-data.json must
// run inside this lock. Two repositories can otherwise both read the same
// snapshot and each write back a version missing the other's change (a lost
// update) — or both write the shared user-data.json.tmp path at once and
// corrupt it. Chaining every operation onto one promise guarantees only one
// read-modify-write sequence is ever in flight, regardless of which
// repository triggered it.
let writeQueue: Promise<unknown> = Promise.resolve();

export function withUserDataLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  // Keep the chain alive even if `operation` rejected — swallow here so a
  // failed write doesn't permanently wedge every write after it.
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}
```

- [ ] **Step 4: Run to verify both pass**

Run: `npx jest src/data/store/jsonFileStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Write a failing integration test proving two repositories racing lose data today**

```typescript
// src/data/store/jsonFileStore.test.ts — add these imports at the top
import { createRecipeRepository } from './recipeRepository';
import { createUserIngredientRepository } from './userIngredientRepository';

// Add near the bottom of the file, alongside the other describe blocks

// Delays every write by the same amount so two concurrent writers'
// writeText calls reliably overlap, instead of leaving the race to
// real filesystem timing (which could pass by luck on a fast machine).
function delayedWriteFileIO(base: FileIO, delayMs: number): FileIO {
  return {
    exists: (path) => base.exists(path),
    readText: (path) => base.readText(path),
    writeText: async (path, content) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return base.writeText(path, content);
    },
    move: (from, to) => base.move(from, to),
  };
}

describe('concurrent writes across repositories', () => {
  it('serializes writes from two different repositories so neither is lost', async () => {
    const slowIO = delayedWriteFileIO(nodeFileIO, 20);
    const recipeRepo = createRecipeRepository(slowIO, dir);
    const ingredientRepo = createUserIngredientRepository(slowIO, dir);
    const customIngredient = {
      id: 'user:1', name: 'Custom',
      nutritionPer100g: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 },
      portions: [], source: 'user' as const,
    };

    await Promise.all([recipeRepo.save(porridge), ingredientRepo.save(customIngredient)]);

    const data = await readUserData(nodeFileIO, dir);
    expect(data.recipes).toEqual([porridge]);
    expect(data.userIngredients).toEqual([customIngredient]);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx jest src/data/store/jsonFileStore.test.ts -t "serializes writes from two different repositories"`
Expected: FAIL — one of the two assertions fails (either `data.recipes` is
`[]` or `data.userIngredients` is `[]`), because both repositories currently
read the same empty snapshot and the later `writeText` call overwrites the
earlier one's `.tmp` write before its `move` runs.

- [ ] **Step 7: Wrap every write in the three existing repositories with `withUserDataLock`**

```typescript
// src/data/store/recipeRepository.ts — replace the full file
import type { Recipe } from '../../domain/recipes/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';

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
    save(recipe: Recipe) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        const others = data.recipes.filter((r) => r.id !== recipe.id);
        await writeUserData(io, dir, { ...data, recipes: [...others, recipe] });
      });
    },
    delete(id: string) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        const remaining = data.recipes.filter((r) => r.id !== id);
        await writeUserData(io, dir, { ...data, recipes: remaining });
      });
    },
  };
}
```

```typescript
// src/data/store/userIngredientRepository.ts — replace the full file
import type { Ingredient } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';

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
    save(ingredient: Ingredient) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        const others = data.userIngredients.filter((i) => i.id !== ingredient.id);
        await writeUserData(io, dir, { ...data, userIngredients: [...others, ingredient] });
      });
    },
  };
}
```

```typescript
// src/data/store/learnedPortionStore.ts — replace the full file
import type { Portion } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';

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
    add(ingredientId: string, portion: Portion) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        const existing = data.learnedPortions[ingredientId] ?? [];
        await writeUserData(io, dir, {
          ...data,
          learnedPortions: { ...data.learnedPortions, [ingredientId]: [...existing, portion] },
        });
      });
    },
  };
}
```

- [ ] **Step 8: Run to verify the integration test passes**

Run: `npx jest src/data/store/jsonFileStore.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 9: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean — this task changes write internals only, no repository's
public interface changed.

- [ ] **Step 10: Commit**

```bash
git add src/data/store/jsonFileStore.ts src/data/store/jsonFileStore.test.ts src/data/store/recipeRepository.ts src/data/store/userIngredientRepository.ts src/data/store/learnedPortionStore.ts
git commit -m "fix(data): serialize all writes to user-data.json to close a lost-update race"
```

---

### Task 2: `PlanRepository`

**Files:**
- Create: `src/data/store/planRepository.ts`
- Create: `src/data/store/planRepository.test.ts`

**Interfaces:**
- Consumes: `MealPlan` (`src/domain/plan/types.ts`, unchanged), `FileIO`, `readUserData`/`writeUserData`/`withUserDataLock` (Task 1)
- Produces: `PlanRepository` interface (`get(): Promise<MealPlan>`, `save(plan: MealPlan): Promise<void>`) and `createPlanRepository(io, dir): PlanRepository` — consumed by Task 3 (`src/data/index.ts` wiring) and Task 4 (`PlanContext`).

Same shape as `recipeRepository.ts`, but for the single `mealPlan` field
`jsonFileStore.ts` already carries (with its empty default,
`{ id: 'default', name: 'This Week', meals: [] }` — no schema change needed).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/data/store/planRepository.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlanRepository } from './planRepository';
import { writeUserData } from './jsonFileStore';
import type { FileIO } from './fileIO';
import type { MealPlan } from '../../domain/plan/types';
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

describe('createPlanRepository', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plan-repo-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the default empty plan before anything is saved', async () => {
    const repo = createPlanRepository(nodeFileIO, dir);
    expect(await repo.get()).toEqual({ id: 'default', name: 'This Week', meals: [] });
  });

  it('save then get returns the saved plan', async () => {
    const repo = createPlanRepository(nodeFileIO, dir);
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 3 }] };
    await repo.save(plan);
    expect(await repo.get()).toEqual(plan);
  });

  it('a second save overwrites rather than merging with the first', async () => {
    const repo = createPlanRepository(nodeFileIO, dir);
    await repo.save({ id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 1 }] });
    const second: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-2', servings: 4 }] };
    await repo.save(second);
    expect(await repo.get()).toEqual(second);
  });

  it('saving a plan preserves already-stored recipes, user ingredients, and learned portions', async () => {
    await writeUserData(nodeFileIO, dir, {
      recipes: [porridge],
      mealPlan: { id: 'default', name: 'This Week', meals: [] },
      userIngredients: [{ id: 'user:1', name: 'Custom', nutritionPer100g: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }, portions: [], source: 'user' }],
      learnedPortions: { 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] },
    });
    const repo = createPlanRepository(nodeFileIO, dir);
    await repo.save({ id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 2 }] });

    const raw = JSON.parse(await nodeFileIO.readText(`${dir}/user-data.json`));
    expect(raw.recipes).toEqual([porridge]);
    expect(raw.userIngredients).toHaveLength(1);
    expect(raw.learnedPortions).toEqual({ 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/data/store/planRepository.test.ts`
Expected: FAIL — `Cannot find module './planRepository'`.

- [ ] **Step 3: Implement `PlanRepository`**

```typescript
// src/data/store/planRepository.ts
import type { MealPlan } from '../../domain/plan/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';

export interface PlanRepository {
  get(): Promise<MealPlan>;
  save(plan: MealPlan): Promise<void>;
}

export function createPlanRepository(io: FileIO, dir: string): PlanRepository {
  return {
    async get() {
      const data = await readUserData(io, dir);
      return data.mealPlan;
    },
    save(plan: MealPlan) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        await writeUserData(io, dir, { ...data, mealPlan: plan });
      });
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/data/store/planRepository.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/store/planRepository.ts src/data/store/planRepository.test.ts
git commit -m "feat(data): add PlanRepository for reading and saving the meal plan"
```

---

### Task 3: Wire `PlanRepository` into `src/data/index.ts`

**Files:**
- Modify: `src/data/index.ts`

**Interfaces:**
- Consumes: `createPlanRepository`/`PlanRepository` (Task 2), `expoFileIO`/`userDataDirectory` (already exported)
- Produces: `createDefaultPlanRepository(): PlanRepository` — consumed by Task 4's `PlanProvider`.

Pure wiring, same pattern as `createDefaultRecipeRepository`. No new tests —
verify with the full suite.

- [ ] **Step 1: Add the export**

```typescript
// src/data/index.ts — add these lines, following the existing
// createDefaultRecipeRepository pattern

import { createPlanRepository, type PlanRepository } from './store/planRepository';

export type { PlanRepository } from './store/planRepository';
export { createPlanRepository } from './store/planRepository';

export function createDefaultPlanRepository(): PlanRepository {
  return createPlanRepository(expoFileIO, userDataDirectory);
}
```

- [ ] **Step 2: Run the full test suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add src/data/index.ts
git commit -m "feat(data): expose createDefaultPlanRepository"
```

---

### Task 4: `PlanContext`

**Files:**
- Create: `src/ui/context/PlanContext.tsx`
- Create: `src/ui/context/PlanContext.test.tsx`

**Interfaces:**
- Consumes: `MealPlan`, `PlannedMeal` (`src/domain/plan/types.ts`), `PlanRepository`/`createDefaultPlanRepository` (Task 3)
- Produces: `planReducer` (exported pure function, for direct unit testing — mirrors `recipeReducer`), `PlanProvider` component, `usePlan()` hook returning `{ plan: MealPlan, loading: boolean, addMeal(meal: PlannedMeal): Promise<void>, removeMeal(recipeId: string): Promise<void>, updateMealServings(recipeId: string, servings: number): Promise<void> }` — consumed by Task 6 (`PlanScreen`), Task 7 (`GroceryScreen`), and Task 8 (root layout).

Same `useReducer` + repository pattern as `RecipeContext.tsx`. Each async
action method computes what the reducer *would* produce, persists that via
`repo.save`, then dispatches the same action so the reducer independently
arrives at the identical state — this way there's exactly one place
(`planReducer`) that knows how to apply an `ADD_MEAL`/`REMOVE_MEAL`/
`UPDATE_MEAL_SERVINGS` change, instead of duplicating that logic once for
persistence and again for the in-memory reducer.

- [ ] **Step 1: Write the failing reducer tests**

```typescript
// src/ui/context/PlanContext.test.tsx — start with these imports and the
// reducer describe block; the Provider tests are added in Step 5.
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { planReducer, PlanProvider, usePlan } from './PlanContext';
import type { PlanRepository } from '../../data/index';
import type { MealPlan } from '../../domain/plan/types';

const emptyPlan: MealPlan = { id: 'default', name: 'This Week', meals: [] };
const oneMealPlan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 2 }] };

describe('planReducer', () => {
  it('SET_PLAN replaces the plan and clears loading', () => {
    const state = planReducer({ plan: emptyPlan, loading: true }, { type: 'SET_PLAN', plan: oneMealPlan });
    expect(state).toEqual({ plan: oneMealPlan, loading: false });
  });

  it('ADD_MEAL appends a meal', () => {
    const state = planReducer({ plan: emptyPlan, loading: false }, { type: 'ADD_MEAL', meal: { recipeId: 'recipe-1', servings: 2 } });
    expect(state.plan.meals).toEqual([{ recipeId: 'recipe-1', servings: 2 }]);
  });

  it('REMOVE_MEAL removes only the targeted meal', () => {
    const twoMeals: MealPlan = { ...emptyPlan, meals: [{ recipeId: 'recipe-1', servings: 2 }, { recipeId: 'recipe-2', servings: 1 }] };
    const state = planReducer({ plan: twoMeals, loading: false }, { type: 'REMOVE_MEAL', recipeId: 'recipe-1' });
    expect(state.plan.meals).toEqual([{ recipeId: 'recipe-2', servings: 1 }]);
  });

  it('UPDATE_MEAL_SERVINGS updates only the targeted meal\'s servings', () => {
    const state = planReducer(
      { plan: oneMealPlan, loading: false },
      { type: 'UPDATE_MEAL_SERVINGS', recipeId: 'recipe-1', servings: 5 },
    );
    expect(state.plan.meals).toEqual([{ recipeId: 'recipe-1', servings: 5 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/ui/context/PlanContext.test.tsx`
Expected: FAIL — `Cannot find module './PlanContext'`.

- [ ] **Step 3: Implement `planReducer` and `PlanContext`**

```typescript
// src/ui/context/PlanContext.tsx
import React, { createContext, useContext, useEffect, useReducer } from 'react';
import type { MealPlan, PlannedMeal } from '../../domain/plan/types';
import { createDefaultPlanRepository, type PlanRepository } from '../../data/index';

const EMPTY_PLAN: MealPlan = { id: 'default', name: 'This Week', meals: [] };

type State = { plan: MealPlan; loading: boolean };
type Action =
  | { type: 'SET_PLAN'; plan: MealPlan }
  | { type: 'ADD_MEAL'; meal: PlannedMeal }
  | { type: 'REMOVE_MEAL'; recipeId: string }
  | { type: 'UPDATE_MEAL_SERVINGS'; recipeId: string; servings: number };

export function planReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PLAN':
      return { plan: action.plan, loading: false };
    case 'ADD_MEAL':
      return { ...state, plan: { ...state.plan, meals: [...state.plan.meals, action.meal] } };
    case 'REMOVE_MEAL':
      return { ...state, plan: { ...state.plan, meals: state.plan.meals.filter((m) => m.recipeId !== action.recipeId) } };
    case 'UPDATE_MEAL_SERVINGS':
      return {
        ...state,
        plan: {
          ...state.plan,
          meals: state.plan.meals.map((m) => (m.recipeId === action.recipeId ? { ...m, servings: action.servings } : m)),
        },
      };
    default:
      return state;
  }
}

type PlanContextValue = {
  plan: MealPlan;
  loading: boolean;
  addMeal(meal: PlannedMeal): Promise<void>;
  removeMeal(recipeId: string): Promise<void>;
  updateMealServings(recipeId: string, servings: number): Promise<void>;
};

const PlanContext = createContext<PlanContextValue | null>(null);

type ProviderProps = { children: React.ReactNode; repository?: PlanRepository };

export function PlanProvider({ children, repository }: ProviderProps) {
  const repo = repository ?? createDefaultPlanRepository();
  const [state, dispatch] = useReducer(planReducer, { plan: EMPTY_PLAN, loading: true });

  useEffect(() => {
    let cancelled = false;
    repo.get().then((plan) => {
      if (!cancelled) dispatch({ type: 'SET_PLAN', plan });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value: PlanContextValue = {
    plan: state.plan,
    loading: state.loading,
    async addMeal(meal: PlannedMeal) {
      const next = planReducer(state, { type: 'ADD_MEAL', meal });
      await repo.save(next.plan);
      dispatch({ type: 'ADD_MEAL', meal });
    },
    async removeMeal(recipeId: string) {
      const next = planReducer(state, { type: 'REMOVE_MEAL', recipeId });
      await repo.save(next.plan);
      dispatch({ type: 'REMOVE_MEAL', recipeId });
    },
    async updateMealServings(recipeId: string, servings: number) {
      const next = planReducer(state, { type: 'UPDATE_MEAL_SERVINGS', recipeId, servings });
      await repo.save(next.plan);
      dispatch({ type: 'UPDATE_MEAL_SERVINGS', recipeId, servings });
    },
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const value = useContext(PlanContext);
  if (!value) throw new Error('usePlan must be used within a PlanProvider');
  return value;
}
```

- [ ] **Step 4: Run to verify the reducer tests pass**

Run: `npx jest src/ui/context/PlanContext.test.tsx`
Expected: PASS, all 4 reducer tests.

- [ ] **Step 5: Write and verify the Provider tests**

```typescript
// src/ui/context/PlanContext.test.tsx — append below the reducer describe block

function fakeRepository(initial: MealPlan): PlanRepository & { saved: MealPlan[] } {
  const saved: MealPlan[] = [];
  return {
    saved,
    async get() {
      return initial;
    },
    async save(plan: MealPlan) {
      saved.push(plan);
    },
  };
}

describe('PlanProvider', () => {
  it('loads the plan from the repository on mount', async () => {
    const repo = fakeRepository(oneMealPlan);
    let tree: renderer.ReactTestRenderer;
    function Consumer() {
      const { plan, loading } = usePlan();
      return <Text>{loading ? 'loading' : plan.meals.length}</Text>;
    }
    await act(async () => {
      tree = renderer.create(
        <PlanProvider repository={repo}>
          <Consumer />
        </PlanProvider>,
      );
    });
    expect(tree!.root.findByType(Text).props.children).toBe(1);
  });

  it('addMeal calls repository.save with the full updated plan and updates state', async () => {
    const repo = fakeRepository(emptyPlan);
    let hookResult: ReturnType<typeof usePlan>;
    function Consumer() {
      hookResult = usePlan();
      return null;
    }
    await act(async () => {
      renderer.create(
        <PlanProvider repository={repo}>
          <Consumer />
        </PlanProvider>,
      );
    });
    await act(async () => {
      await hookResult!.addMeal({ recipeId: 'recipe-1', servings: 2 });
    });
    expect(repo.saved).toEqual([{ id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 2 }] }]);
    expect(hookResult!.plan.meals).toEqual([{ recipeId: 'recipe-1', servings: 2 }]);
  });

  it('removeMeal calls repository.save and updates state', async () => {
    const repo = fakeRepository(oneMealPlan);
    let hookResult: ReturnType<typeof usePlan>;
    function Consumer() {
      hookResult = usePlan();
      return null;
    }
    await act(async () => {
      renderer.create(
        <PlanProvider repository={repo}>
          <Consumer />
        </PlanProvider>,
      );
    });
    await act(async () => {
      await hookResult!.removeMeal('recipe-1');
    });
    expect(repo.saved).toEqual([{ id: 'default', name: 'This Week', meals: [] }]);
    expect(hookResult!.plan.meals).toEqual([]);
  });

  it('updateMealServings calls repository.save and updates state', async () => {
    const repo = fakeRepository(oneMealPlan);
    let hookResult: ReturnType<typeof usePlan>;
    function Consumer() {
      hookResult = usePlan();
      return null;
    }
    await act(async () => {
      renderer.create(
        <PlanProvider repository={repo}>
          <Consumer />
        </PlanProvider>,
      );
    });
    await act(async () => {
      await hookResult!.updateMealServings('recipe-1', 6);
    });
    expect(repo.saved).toEqual([{ id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 6 }] }]);
    expect(hookResult!.plan.meals).toEqual([{ recipeId: 'recipe-1', servings: 6 }]);
  });
});
```

Run: `npx jest src/ui/context/PlanContext.test.tsx`
Expected: PASS, all 8 tests (4 reducer + 4 provider).

- [ ] **Step 6: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/context/PlanContext.tsx src/ui/context/PlanContext.test.tsx
git commit -m "feat(ui): add PlanContext for the active meal plan"
```

---

### Task 5: `resolveIngredientsForRecipes` helper

**Files:**
- Create: `src/ui/screens/resolveIngredientsForRecipes.ts`
- Create: `src/ui/screens/resolveIngredientsForRecipes.test.ts`

**Interfaces:**
- Consumes: `Ingredient` (`src/domain/ingredients/types.ts`), `Recipe` (`src/domain/recipes/types.ts`)
- Produces: `resolveIngredientsForRecipes(resolve: (id: string) => Promise<Ingredient | null>, recipes: Recipe[]): Promise<Map<string, Ingredient>>` — consumed by Task 6 (`PlanScreen`, for per-meal macros) and Task 7 (`GroceryScreen`, for `buildGroceryList`'s ingredients argument).

`RecipeDetailScreen.tsx` already has this exact loop inline (resolve every
ingredient a recipe references via `IngredientContext`'s `resolve`, building
a `Map`) for a single recipe. Both new screens need the same resolution
across *every* recipe referenced by the plan, so this extracts it once rather
than duplicating the loop a second and third time. This is pure, non-React
logic, so — unlike the screens themselves — it gets real TDD, same as
`src/domain/` code.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/ui/screens/resolveIngredientsForRecipes.test.ts
import { resolveIngredientsForRecipes } from './resolveIngredientsForRecipes';
import { oats, onion, porridge } from '../../domain/testing/fixtures';
import type { Recipe } from '../../domain/recipes/types';
import type { Ingredient } from '../../domain/ingredients/types';

const soup: Recipe = {
  id: 'recipe-2', name: 'Soup', servings: 4,
  ingredients: [
    { ingredientId: oats.id, quantity: { grams: 100, input: { amount: 100, unit: { kind: 'mass', symbol: 'g' } } } },
    { ingredientId: onion.id, quantity: { grams: 220, input: { amount: 220, unit: { kind: 'mass', symbol: 'g' } } } },
  ],
  steps: ['Simmer everything.'],
};

function fakeResolve(available: Ingredient[]): (id: string) => Promise<Ingredient | null> {
  const byId = new Map(available.map((i) => [i.id, i]));
  return async (id) => byId.get(id) ?? null;
}

describe('resolveIngredientsForRecipes', () => {
  it('resolves every distinct ingredient across multiple recipes', async () => {
    const map = await resolveIngredientsForRecipes(fakeResolve([oats, onion]), [porridge, soup]);
    expect(map.get(oats.id)).toEqual(oats);
    expect(map.get(onion.id)).toEqual(onion);
    expect(map.size).toBe(2);
  });

  it('does not call resolve twice for an ingredient shared by two recipes', async () => {
    const calls: string[] = [];
    const resolve = async (id: string) => {
      calls.push(id);
      return id === oats.id ? oats : null;
    };
    await resolveIngredientsForRecipes(resolve, [porridge, { ...porridge, id: 'recipe-3' }]);
    expect(calls).toEqual([oats.id]);
  });

  it('omits an id that fails to resolve, rather than throwing', async () => {
    const map = await resolveIngredientsForRecipes(fakeResolve([]), [porridge]);
    expect(map.size).toBe(0);
  });

  it('returns an empty map for no recipes', async () => {
    const map = await resolveIngredientsForRecipes(fakeResolve([oats]), []);
    expect(map.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/ui/screens/resolveIngredientsForRecipes.test.ts`
Expected: FAIL — `Cannot find module './resolveIngredientsForRecipes'`.

- [ ] **Step 3: Implement it**

```typescript
// src/ui/screens/resolveIngredientsForRecipes.ts
import type { Ingredient } from '../../domain/ingredients/types';
import type { Recipe } from '../../domain/recipes/types';

// Resolves every distinct ingredient referenced across a set of recipes into
// one combined map, keyed by ingredientId. Shared by PlanScreen (per-meal
// macros) and GroceryScreen (buildGroceryList's ingredients argument) so the
// USDA + user + learned-portion resolution loop (IngredientContext's
// `resolve`) isn't duplicated in each screen.
export async function resolveIngredientsForRecipes(
  resolve: (id: string) => Promise<Ingredient | null>,
  recipes: Recipe[],
): Promise<Map<string, Ingredient>> {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    for (const item of recipe.ingredients) {
      ids.add(item.ingredientId);
    }
  }

  const map = new Map<string, Ingredient>();
  for (const id of ids) {
    const resolved = await resolve(id);
    if (resolved) map.set(id, resolved);
  }
  return map;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/ui/screens/resolveIngredientsForRecipes.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/resolveIngredientsForRecipes.ts src/ui/screens/resolveIngredientsForRecipes.test.ts
git commit -m "feat(ui): add resolveIngredientsForRecipes shared helper"
```

---

### Task 6: `PlanScreen`

**Files:**
- Create: `src/ui/screens/PlanScreen.tsx`
- Create: `src/ui/screens/PlanScreen.test.tsx`

**Interfaces:**
- Consumes: `usePlan()` (Task 4), `useRecipes()` (existing `RecipeContext`), `useIngredients()` (existing `IngredientContext`), `resolveIngredientsForRecipes` (Task 5), `scaleRecipe`/`calculateMacros` (existing, `src/domain/recipes/`)
- Produces: `PlanScreen` component — consumed by Task 8's `app/(tabs)/plan/index.tsx`.

Not wired into a route yet — this task builds and tests the screen exactly
like `RecipeListScreen`/`RecipeDetailScreen` were built, as a standalone
component rendered directly in its test. Task 8 does the file-routing wiring
once this and `GroceryScreen` both exist.

Behavior, per the spec: list the current plan's meals with per-meal macros
(the macros for that meal's *whole* planned quantity — recipe scaled to that
meal's servings — matching how `buildGroceryList` also sums whole planned
quantities, not per-serving), a way to add a recipe with a servings count,
remove a meal, and edit a meal's servings inline. A meal whose recipe no
longer exists (deleted) shows a "Recipe was deleted" row with "Remove from
plan" instead of crashing — the `RECIPE_NOT_FOUND` handling from spec §5.
Since a recipe already in the plan isn't offered a second time (see the
Global Constraints note on `recipeId` uniqueness), the "add" list only shows
recipes not currently planned.

- [ ] **Step 1: Implement the screen**

```typescript
// src/ui/screens/PlanScreen.tsx
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePlan } from '../context/PlanContext';
import { useRecipes } from '../context/RecipeContext';
import { useIngredients } from '../context/IngredientContext';
import { resolveIngredientsForRecipes } from './resolveIngredientsForRecipes';
import { scaleRecipe } from '../../domain/recipes/scale';
import { calculateMacros } from '../../domain/recipes/macros';
import type { Ingredient } from '../../domain/ingredients/types';
import type { Recipe } from '../../domain/recipes/types';

export function PlanScreen() {
  const { plan, loading: planLoading, addMeal, removeMeal, updateMealServings } = usePlan();
  const { recipes, loading: recipesLoading } = useRecipes();
  const { resolve } = useIngredients();
  const [ingredientMap, setIngredientMap] = useState<Map<string, Ingredient> | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickedRecipe, setPickedRecipe] = useState<Recipe | null>(null);
  const [servingsText, setServingsText] = useState('');

  useEffect(() => {
    const plannedRecipes = plan.meals
      .map((meal) => recipes.find((r) => r.id === meal.recipeId))
      .filter((r): r is Recipe => r !== undefined);
    let cancelled = false;
    resolveIngredientsForRecipes(resolve, plannedRecipes).then((map) => {
      if (!cancelled) setIngredientMap(map);
    });
    return () => {
      cancelled = true;
    };
    // Re-resolves whenever the plan or the recipe list changes — both are
    // exactly the inputs that can change which ingredients need resolving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, recipes]);

  if (planLoading || recipesLoading || !ingredientMap) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const plannedRecipeIds = new Set(plan.meals.map((m) => m.recipeId));
  const availableToAdd = recipes.filter((r) => !plannedRecipeIds.has(r.id));

  return (
    <ScrollView style={styles.container}>
      {plan.meals.length === 0 && <Text>No meals planned yet.</Text>}

      {plan.meals.map((meal) => {
        const recipe = recipes.find((r) => r.id === meal.recipeId);
        if (!recipe) {
          return (
            <View key={meal.recipeId} style={styles.row}>
              <Text>Recipe was deleted.</Text>
              <Pressable onPress={() => removeMeal(meal.recipeId)}>
                <Text style={styles.link}>Remove from plan</Text>
              </Pressable>
            </View>
          );
        }

        const scaled = scaleRecipe(recipe, meal.servings);
        const macros = scaled.ok ? calculateMacros(scaled.value, ingredientMap) : scaled;

        return (
          <View key={meal.recipeId} style={styles.row}>
            <Text style={styles.rowTitle}>{recipe.name}</Text>
            <View style={styles.servingsRow}>
              <TextInput
                style={styles.servingsInput}
                keyboardType="numeric"
                defaultValue={String(meal.servings)}
                onChangeText={(text) => {
                  const parsed = Number(text);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    updateMealServings(meal.recipeId, parsed);
                  }
                }}
              />
              <Text>servings</Text>
            </View>
            {macros.ok ? (
              <Text style={styles.macros}>
                {Math.round(macros.value.total.kcal)} kcal, {Math.round(macros.value.total.proteinG)}g protein,{' '}
                {Math.round(macros.value.total.carbsG)}g carbs, {Math.round(macros.value.total.fatG)}g fat
              </Text>
            ) : (
              <Text style={styles.macros}>Macros unavailable.</Text>
            )}
            <Pressable onPress={() => removeMeal(meal.recipeId)}>
              <Text style={styles.link}>Remove</Text>
            </Pressable>
          </View>
        );
      })}

      {!adding && (
        <Pressable style={styles.addButton} onPress={() => setAdding(true)}>
          <Text>+ Add recipe to plan</Text>
        </Pressable>
      )}

      {adding && !pickedRecipe && (
        <View>
          <Text style={styles.sectionHeading}>Pick a recipe</Text>
          {availableToAdd.map((recipe) => (
            <Pressable key={recipe.id} style={styles.row} onPress={() => setPickedRecipe(recipe)}>
              <Text>{recipe.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {adding && pickedRecipe && (
        <View>
          <Text style={styles.sectionHeading}>Servings of {pickedRecipe.name}</Text>
          <TextInput
            style={styles.servingsInput}
            keyboardType="numeric"
            value={servingsText}
            onChangeText={setServingsText}
            placeholder={String(pickedRecipe.servings)}
          />
          <Pressable
            style={styles.addButton}
            onPress={async () => {
              const parsed = Number(servingsText);
              if (!Number.isFinite(parsed) || parsed <= 0) return;
              await addMeal({ recipeId: pickedRecipe.id, servings: parsed });
              setAdding(false);
              setPickedRecipe(null);
              setServingsText('');
            }}
          >
            <Text>Add to plan</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  servingsInput: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, width: 60 },
  macros: { color: '#666', marginTop: 4 },
  link: { color: '#0066cc', marginTop: 4 },
  addButton: { padding: 16, alignItems: 'center' },
  sectionHeading: { marginTop: 16, fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 2: Write and run the smoke tests**

```typescript
// src/ui/screens/PlanScreen.test.tsx
jest.mock('../../data/index', () => {
  const actual = jest.requireActual('../../data/index');
  return { ...actual, resolveIngredient: jest.fn(async () => null) };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';
import { PlanScreen } from './PlanScreen';
import { PlanProvider } from '../context/PlanContext';
import { RecipeProvider } from '../context/RecipeContext';
import { IngredientProvider } from '../context/IngredientContext';
import type {
  PlanRepository, RecipeRepository, UserIngredientRepository, LearnedPortionStore,
} from '../../data/index';
import type { MealPlan } from '../../domain/plan/types';
import type { Recipe } from '../../domain/recipes/types';
import { porridge } from '../../domain/testing/fixtures';

// react-test-renderer under this project's React/RN versions can't run
// Pressable's internal hooks — same workaround used in every other screen
// test (e.g. RecipeListScreen.test.tsx).
jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: ({ children, onPress, style, ...props }: any) =>
      React.createElement(View, { onPress, style, ...props }, children),
  };
});

function fakeRecipeRepo(recipes: Recipe[]): RecipeRepository {
  return { async getAll() { return recipes; }, async save() {}, async delete() {} };
}
function fakePlanRepo(plan: MealPlan): PlanRepository & { saved: MealPlan[] } {
  const saved: MealPlan[] = [];
  return { saved, async get() { return plan; }, async save(p) { saved.push(p); } };
}
function fakeUserIngredientRepo(): UserIngredientRepository {
  return { async getAll() { return []; }, async save() {} };
}
function fakeLearnedPortionStore(): LearnedPortionStore {
  return { async getFor() { return []; }, async add() {} };
}

function Harness({ planRepo, recipeRepo }: { planRepo: PlanRepository; recipeRepo: RecipeRepository }) {
  return (
    <RecipeProvider repository={recipeRepo}>
      <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={fakeLearnedPortionStore()}>
        <PlanProvider repository={planRepo}>
          <PlanScreen />
        </PlanProvider>
      </IngredientProvider>
    </RecipeProvider>
  );
}

describe('PlanScreen', () => {
  it('renders each planned meal with its recipe name', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: porridge.id, servings: 2 }] };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness planRepo={fakePlanRepo(plan)} recipeRepo={fakeRecipeRepo([porridge])} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names).toContain('Porridge');
  });

  it('shows a "recipe was deleted" row and removes it from the plan', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'ghost', servings: 1 }] };
    const planRepo = fakePlanRepo(plan);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness planRepo={planRepo} recipeRepo={fakeRecipeRepo([])} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names).toContain('Recipe was deleted.');

    const removeLink = tree!.root.findAllByType(Pressable).find((p) =>
      p.findAllByType(Text).some((t) => t.props.children === 'Remove from plan'),
    );
    await act(async () => {
      await removeLink?.props.onPress();
    });
    expect(planRepo.saved).toEqual([{ id: 'default', name: 'This Week', meals: [] }]);
  });

  it('adding a recipe to the plan calls addMeal with the entered servings', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [] };
    const planRepo = fakePlanRepo(plan);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness planRepo={planRepo} recipeRepo={fakeRecipeRepo([porridge])} />);
    });

    const addButton = tree!.root.findAllByType(Pressable).find((p) =>
      p.findAllByType(Text).some((t) => t.props.children === '+ Add recipe to plan'),
    );
    act(() => {
      addButton?.props.onPress();
    });

    const recipeRow = tree!.root.findAllByType(Pressable).find((p) =>
      p.findAllByType(Text).some((t) => t.props.children === 'Porridge'),
    );
    act(() => {
      recipeRow?.props.onPress();
    });

    const servingsInput = tree!.root.findByType(TextInput);
    act(() => {
      servingsInput.props.onChangeText('3');
    });

    const confirmButton = tree!.root.findAllByType(Pressable).find((p) =>
      p.findAllByType(Text).some((t) => t.props.children === 'Add to plan'),
    );
    await act(async () => {
      await confirmButton?.props.onPress();
    });

    expect(planRepo.saved).toEqual([{ id: 'default', name: 'This Week', meals: [{ recipeId: porridge.id, servings: 3 }] }]);
  });
});
```

Run: `npx jest src/ui/screens/PlanScreen.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 3: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/PlanScreen.tsx src/ui/screens/PlanScreen.test.tsx
git commit -m "feat(ui): add PlanScreen"
```

---

### Task 7: `GroceryScreen`

**Files:**
- Create: `src/ui/screens/GroceryScreen.tsx`
- Create: `src/ui/screens/GroceryScreen.test.tsx`

**Interfaces:**
- Consumes: `usePlan()` (Task 4), `useRecipes()`, `useIngredients()`, `resolveIngredientsForRecipes` (Task 5), `buildGroceryList` (existing, `src/domain/grocery/aggregate.ts`)
- Produces: `GroceryScreen` component — consumed by Task 8's `app/(tabs)/grocery/index.tsx`.

Like `PlanScreen`, not wired into a route yet. Display-only per spec §1 (no
check-off). `buildGroceryList` is all-or-nothing — if *any* planned meal
references a deleted recipe or an unresolvable ingredient, the whole call
fails with one `AppError`, since it has no per-line partial-failure mode.
Rather than changing that pure domain function (out of scope — it's already
built and tested), this screen shows one friendly message per error code,
each pointing back at the Plan tab, where the actual fix (removing or
correcting the offending meal) happens.

Recomputes whenever the plan or recipe list changes, via a plain dependency
effect — not `useFocusEffect`. Both are reactive Context values already,
so a change on the Plan tab re-renders this screen the moment its Context
value changes; there's nothing here that reads from outside React state that
would need a focus-specific refresh.

- [ ] **Step 1: Implement the screen**

```typescript
// src/ui/screens/GroceryScreen.tsx
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePlan } from '../context/PlanContext';
import { useRecipes } from '../context/RecipeContext';
import { useIngredients } from '../context/IngredientContext';
import { resolveIngredientsForRecipes } from './resolveIngredientsForRecipes';
import { buildGroceryList } from '../../domain/grocery/aggregate';
import type { GroceryList } from '../../domain/grocery/types';
import type { AppError } from '../../domain/result';
import type { Recipe } from '../../domain/recipes/types';

function errorMessage(error: AppError): string {
  switch (error.code) {
    case 'RECIPE_NOT_FOUND':
      return 'A planned recipe was deleted. Remove it from your plan to see the grocery list.';
    case 'INGREDIENT_NOT_FOUND':
      return 'An ingredient was removed from a planned recipe. Fix that recipe to see the grocery list.';
    default:
      return 'Unable to build the grocery list.';
  }
}

export function GroceryScreen() {
  const { plan, loading: planLoading } = usePlan();
  const { recipes, loading: recipesLoading } = useRecipes();
  const { resolve } = useIngredients();
  const [list, setList] = useState<GroceryList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (planLoading || recipesLoading) return;
    let cancelled = false;
    (async () => {
      const recipesById = new Map(recipes.map((r) => [r.id, r]));
      const plannedRecipes = plan.meals
        .map((meal) => recipesById.get(meal.recipeId))
        .filter((r): r is Recipe => r !== undefined);
      const ingredientMap = await resolveIngredientsForRecipes(resolve, plannedRecipes);
      const result = buildGroceryList(plan, recipesById, ingredientMap);
      if (cancelled) return;
      if (result.ok) {
        setList(result.value);
        setError(null);
      } else {
        setList(null);
        setError(errorMessage(result.error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, recipes, planLoading, recipesLoading]);

  if (planLoading || recipesLoading || (!list && !error)) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text>{error}</Text>
      </View>
    );
  }

  if (list!.lines.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No meals planned yet — add some on the Plan tab.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {list!.lines.map((line) => (
        <View key={line.ingredientId} style={styles.row}>
          <Text style={styles.rowTitle}>{line.name}</Text>
          <Text style={styles.rowSubtitle}>{line.display}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc',
  },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { fontSize: 14, color: '#666' },
});
```

- [ ] **Step 2: Write and run the smoke tests**

```typescript
// src/ui/screens/GroceryScreen.test.tsx
jest.mock('../../data/index', () => {
  const actual = jest.requireActual('../../data/index');
  return {
    ...actual,
    resolveIngredient: jest.fn(async (id: string) => (id === oatsId ? oats : null)),
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { GroceryScreen } from './GroceryScreen';
import { PlanProvider } from '../context/PlanContext';
import { RecipeProvider } from '../context/RecipeContext';
import { IngredientProvider } from '../context/IngredientContext';
import type {
  PlanRepository, RecipeRepository, UserIngredientRepository, LearnedPortionStore,
} from '../../data/index';
import type { MealPlan } from '../../domain/plan/types';
import type { Recipe } from '../../domain/recipes/types';
import { oats, porridge } from '../../domain/testing/fixtures';

const oatsId = oats.id;

function fakeRecipeRepo(recipes: Recipe[]): RecipeRepository {
  return { async getAll() { return recipes; }, async save() {}, async delete() {} };
}
function fakePlanRepo(plan: MealPlan): PlanRepository {
  return { async get() { return plan; }, async save() {} };
}
function fakeUserIngredientRepo(): UserIngredientRepository {
  return { async getAll() { return []; }, async save() {} };
}
function fakeLearnedPortionStore(): LearnedPortionStore {
  return { async getFor() { return []; }, async add() {} };
}

function Harness({ plan, recipes = [] }: { plan: MealPlan; recipes?: Recipe[] }) {
  return (
    <RecipeProvider repository={fakeRecipeRepo(recipes)}>
      <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={fakeLearnedPortionStore()}>
        <PlanProvider repository={fakePlanRepo(plan)}>
          <GroceryScreen />
        </PlanProvider>
      </IngredientProvider>
    </RecipeProvider>
  );
}

describe('GroceryScreen', () => {
  it('shows an empty-state message for a plan with no meals', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness plan={{ id: 'default', name: 'This Week', meals: [] }} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names.some((n) => typeof n === 'string' && n.includes('No meals planned'))).toBe(true);
  });

  it('renders an aggregated grocery line for a planned recipe', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: porridge.id, servings: 2 }] };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness plan={plan} recipes={[porridge]} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names).toContain(oats.name);
  });

  it('shows a friendly message instead of crashing when a planned recipe was deleted', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'ghost', servings: 1 }] };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness plan={plan} recipes={[]} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names.some((n) => typeof n === 'string' && n.includes('Remove it from your plan'))).toBe(true);
  });
});
```

Run: `npx jest src/ui/screens/GroceryScreen.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 3: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/GroceryScreen.tsx src/ui/screens/GroceryScreen.test.tsx
git commit -m "feat(ui): add GroceryScreen"
```

---

### Task 8: Navigation restructuring to `NativeTabs`

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/recipes/_layout.tsx`
- Create: `app/(tabs)/recipes/index.tsx` (moved from `app/index.tsx`)
- Create: `app/(tabs)/recipes/new.tsx` (moved from `app/new.tsx`)
- Create: `app/(tabs)/recipes/[id]/index.tsx` (moved from `app/[id]/index.tsx`)
- Create: `app/(tabs)/recipes/[id]/edit.tsx` (moved from `app/[id]/edit.tsx`)
- Create: `app/(tabs)/plan/_layout.tsx`
- Create: `app/(tabs)/plan/index.tsx`
- Create: `app/(tabs)/grocery/_layout.tsx`
- Create: `app/(tabs)/grocery/index.tsx`
- Delete: `app/index.tsx`, `app/new.tsx`, `app/[id]/index.tsx`, `app/[id]/edit.tsx` (and the now-empty `app/[id]/` directory)
- Modify: `app/_layout.tsx`
- Modify: `src/ui/screens/RecipeListScreen.tsx`
- Modify: `src/ui/screens/RecipeListScreen.test.tsx`
- Modify: `src/ui/screens/RecipeDetailScreen.tsx`

**Interfaces:**
- Consumes: `PlanScreen` (Task 6), `GroceryScreen` (Task 7), `PlanProvider` (Task 4), everything already exported from the existing screens/contexts
- Produces: the app's final route tree — nothing later in this plan depends on it; it's the integration task.

This is pure wiring and file movement — no new logic, so no new tests beyond
updating the one existing assertion that hardcodes a route path. Verify with
the existing suite plus a manual read-through of the route tree.

Route paths change because `recipes`/`plan`/`grocery` are real path segments
(only `(tabs)` is a parenthesized group, invisible in the URL): the recipe
list moves from `/` to `/recipes`, recipe detail from `/{id}` to
`/recipes/{id}`, edit from `/{id}/edit` to `/recipes/{id}/edit`, and "new"
from `/new` to `/recipes/new`. `/add-ingredient` is unaffected — it stays a
sibling of `(tabs)` in the root `Stack`, reachable from any tab exactly as it
is reachable today from the one screen that pushes it
(`RecipeEditScreen.tsx`, which does not change).

- [ ] **Step 1: Create the tab bar layout**

```typescript
// app/(tabs)/_layout.tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="recipes">
        <NativeTabs.Trigger.Icon sf="book.closed" md="menu_book" />
        <NativeTabs.Trigger.Label>Recipes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="grocery">
        <NativeTabs.Trigger.Icon sf="cart" md="shopping_cart" />
        <NativeTabs.Trigger.Label>Grocery</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

- [ ] **Step 2: Move the Recipes tab's routes and give them their own nested Stack**

Native tabs render no header themselves, so each tab needs a `Stack` nested
one level inside it for headers/titles — same titles the existing root
`Stack` set, just moved down one level.

```typescript
// app/(tabs)/recipes/_layout.tsx
import { Stack } from 'expo-router/stack';

export default function RecipesStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Recipes' }} />
      <Stack.Screen name="new" options={{ title: 'New Recipe' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Recipe' }} />
    </Stack>
  );
}
```

Move the four existing route files (git tracks these as renames when staged
together — use `git mv`, then update each file's now-deeper relative import
path):

```bash
mkdir -p "app/(tabs)/recipes/[id]"
git mv app/index.tsx "app/(tabs)/recipes/index.tsx"
git mv app/new.tsx "app/(tabs)/recipes/new.tsx"
git mv "app/[id]/index.tsx" "app/(tabs)/recipes/[id]/index.tsx"
git mv "app/[id]/edit.tsx" "app/(tabs)/recipes/[id]/edit.tsx"
rmdir "app/[id]"
```

```typescript
// app/(tabs)/recipes/index.tsx — update the import path only
import { RecipeListScreen } from '../../../src/ui/screens/RecipeListScreen';

export default RecipeListScreen;
```

```typescript
// app/(tabs)/recipes/new.tsx — update the two import paths only
import { useEffect } from 'react';
import { RecipeEditScreen } from '../../../src/ui/screens/RecipeEditScreen';
import { useDraftRecipe } from '../../../src/ui/context/DraftRecipeContext';

export default function NewRecipeRoute() {
  const { startNew } = useDraftRecipe();
  useEffect(() => {
    startNew();
  }, []);
  return <RecipeEditScreen />;
}
```

```typescript
// app/(tabs)/recipes/[id]/index.tsx — update the import path only
import { RecipeDetailScreen } from '../../../../src/ui/screens/RecipeDetailScreen';

export default RecipeDetailScreen;
```

```typescript
// app/(tabs)/recipes/[id]/edit.tsx — update the four import paths only
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RecipeEditScreen } from '../../../../src/ui/screens/RecipeEditScreen';
import { useDraftRecipe, type DraftIngredientLine } from '../../../../src/ui/context/DraftRecipeContext';
import { useRecipes } from '../../../../src/ui/context/RecipeContext';
import { useIngredients } from '../../../../src/ui/context/IngredientContext';

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
  }, [recipe?.id]);

  if (!ready) return null;
  return <RecipeEditScreen />;
}
```

- [ ] **Step 3: Update the two hardcoded navigation paths that moved**

```typescript
// src/ui/screens/RecipeListScreen.tsx — change router.push(`/${item.id}`) to:
<Pressable style={styles.row} onPress={() => router.push(`/recipes/${item.id}`)}>
```

```typescript
// src/ui/screens/RecipeListScreen.tsx — change <Link href="/new"> to:
<Link href="/recipes/new" style={[styles.addButton, { paddingBottom: 16 + insets.bottom }]}>
```

```typescript
// src/ui/screens/RecipeDetailScreen.tsx — change router.push(`/${recipe.id}/edit`) to:
<Pressable style={styles.editButton} onPress={() => router.push(`/recipes/${recipe.id}/edit`)}>
```

`RecipeEditScreen.tsx`'s `router.push('/add-ingredient')` is unchanged —
that route doesn't move.

- [ ] **Step 4: Update the one test that hardcodes the old path**

```typescript
// src/ui/screens/RecipeListScreen.test.tsx — change the final assertion
expect(pushMock).toHaveBeenCalledWith('/recipes/recipe-1');
```

- [ ] **Step 5: Add the Plan and Grocery tabs**

```typescript
// app/(tabs)/plan/_layout.tsx
import { Stack } from 'expo-router/stack';

export default function PlanStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Plan' }} />
    </Stack>
  );
}
```

```typescript
// app/(tabs)/plan/index.tsx
import { PlanScreen } from '../../../src/ui/screens/PlanScreen';

export default PlanScreen;
```

```typescript
// app/(tabs)/grocery/_layout.tsx
import { Stack } from 'expo-router/stack';

export default function GroceryStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Grocery List' }} />
    </Stack>
  );
}
```

```typescript
// app/(tabs)/grocery/index.tsx
import { GroceryScreen } from '../../../src/ui/screens/GroceryScreen';

export default GroceryScreen;
```

- [ ] **Step 6: Update the root layout**

`add-ingredient` stays exactly as it was (a plain pushed screen with a
title, not a modal presentation — this task doesn't change its behavior,
only its position relative to the new tabs group) — it just moves from being
one of several `Stack.Screen`s alongside the recipe routes to being the
`(tabs)` group's one sibling.

```typescript
// app/_layout.tsx
import { Stack } from 'expo-router/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';
import { IngredientProvider } from '../src/ui/context/IngredientContext';
import { DraftRecipeProvider } from '../src/ui/context/DraftRecipeContext';
import { PlanProvider } from '../src/ui/context/PlanContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <RecipeProvider>
          <IngredientProvider>
            <PlanProvider>
              <DraftRecipeProvider>
                <Stack>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="add-ingredient" options={{ title: 'Add Ingredient' }} />
                </Stack>
              </DraftRecipeProvider>
            </PlanProvider>
          </IngredientProvider>
        </RecipeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 7: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all clean. This is the step that catches a missed import-path
update or a stale route reference — if anything above was mistyped, this is
where it surfaces as a red test or a `tsc` error, not a silent bug.

- [ ] **Step 8: Manual device/simulator check**

Run: `npx expo start` (tunnel mode if LAN mode doesn't reach your device,
per this project's established fallback) and confirm on a real device or
simulator:
- Three tabs appear at the bottom: Recipes, Plan, Grocery.
- The Recipes tab behaves exactly as before (list → detail → edit → new →
  add-ingredient), just under its own tab now.
- The Plan tab loads (empty state if no recipes exist yet), and adding a
  recipe (create one via the Recipes tab first if needed) with a servings
  count shows it in the plan with macros.
- The Grocery tab reflects whatever is in the plan, aggregated.
- Deleting a recipe that's still in the plan (via the Recipes tab) makes the
  Plan tab show "Recipe was deleted" for that meal instead of crashing, and
  the Grocery tab shows its friendly message until that meal is removed.

This is the same level of manual verification Plan 3a's Task 14 did before
merging — automated tests don't catch real on-device Expo/router behavior
(Plan 3a itself found 6 such bugs this way).

- [ ] **Step 9: Commit**

```bash
git add -A app/ src/ui/screens/RecipeListScreen.tsx src/ui/screens/RecipeListScreen.test.tsx src/ui/screens/RecipeDetailScreen.tsx
git commit -m "feat(ui): restructure navigation into Recipes/Plan/Grocery tabs"
```

---

## Done

At this point: a working weekly meal planner (add/remove/adjust recipes with
live per-meal macros) and a grocery list aggregated from it, both persisted,
both reachable via their own tab, with `RECIPE_NOT_FOUND` handled gracefully
in both places it can surface, and the write-concurrency gap that would have
made this risky closed before it mattered. This completes the parent spec's
v1 scope (§2): recipe book, ingredient search, macro calculation, meal
planning, and grocery list generation are all built.
