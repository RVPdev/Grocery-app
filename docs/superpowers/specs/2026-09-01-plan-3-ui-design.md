# Plan 3 — UI Layer Design

**Date:** 2026-09-01
**Status:** Approved design, ready for implementation planning
**Parent spec:** `docs/superpowers/specs/2026-08-29-macro-recipe-app-design.md`

---

## 1. Purpose & Scope

Plan 1 built the domain core (units, macros, scaling, grocery aggregation — all pure,
all tested). Plan 2 built the data layer (bundled USDA reader, JSON recipe store).
Neither is usable by a person yet. This plan builds the screens that let someone
actually create recipes, plan a week, and get a grocery list — closing the loop
described in the parent spec's Problem & Purpose section.

### In scope for this plan

- Recipe book: list, detail, create/edit, delete
- Ingredient search (USDA + user-created) and manual amount entry
- The `NO_PORTION_DATA` manual-entry prompt, and permanently learning the answer
- Custom ingredient creation, for foods absent from USDA entirely
- Weekly meal planner: a single active `MealPlan`
- Grocery list screen, derived from the current plan
- The persistence extensions needed to store plans, user ingredients, and learned
  portions (extending Plan 2's JSON store, not replacing it)

### Explicitly out of scope for this plan

Everything the parent spec already deferred (§2): pantry tracking, aisle grouping,
custom units, barcode scanning, accounts/sync, ads/premium, iOS. Additionally, out of
scope *for this plan specifically* even though it's v1-scoped elsewhere:

| Deferred | Reason |
|---|---|
| Multiple named/saved meal plans | Domain type (`MealPlan.name`) supports it, but the spec describes a single weekly planner. One active plan; the `name` field exists in storage but the UI never exposes plan-switching. |
| Grocery list interactivity (check-off) | `GroceryList` has no per-line state in the domain model. Display-only in v1; check-off is additive later and doesn't require type changes (same reasoning the parent spec gives for pantry tracking). |

---

## 2. Architecture: Screens & Navigation

**Expo Router**, file-based, three bottom tabs:

```
app/
  _layout.tsx              — RecipeContext/PlanContext/IngredientContext providers,
                              top-level error boundary
  (tabs)/
    recipes/
      index.tsx            — Recipe list
      [id].tsx              — Recipe detail: macros, per-serving macros, steps,
                              scale-for-N control (calls scaleRecipe for display only)
      [id]/edit.tsx          — Create/edit: name, servings, steps, ingredient lines
      new.tsx                — edit.tsx with no id
    plan/
      index.tsx             — Current MealPlan: meals list, add-recipe-to-plan
                              (recipe + servings), remove meal, per-meal macros
    grocery/
      index.tsx             — GroceryList derived from the current plan,
                              recomputed on screen focus (pure function, cheap)
  ingredient-picker.tsx      — modal: search USDA + user ingredients; "add custom
                              ingredient" escape hatch
  amount-entry.tsx           — modal: amount + unit picker, limited to units the
                              chosen ingredient has portions for, plus grams/kg/oz/lb
                              (always valid); "use a different unit" escape hatch
                              opens the full unit list
  manual-portion-prompt.tsx  — modal: "How many grams is 1 {unit} of {ingredient}?",
                              shown only when the escape-hatch unit has no portion
                              data (i.e. NO_PORTION_DATA)
  custom-ingredient.tsx      — modal: manual nutritionPer100g + at least one portion,
                              for a food absent from USDA search entirely
```

Ingredient search, amount entry, portion teaching, and custom-ingredient creation are
steps inside "build a recipe," reached only from `edit.tsx` — none are top-level
destinations.

### Rejected alternative

**Grocery nested inside the Plan tab**, since it has no independent state and is
always derived from the plan. Rejected because the grocery list is a primary,
independently-valuable view (the parent spec's Problem & Purpose names it as one of
the three tools this app replaces) and deserves equal footing with Recipes and Plan
rather than being buried a level down.

---

## 3. State Management

Three `useReducer`-backed Context providers, wrapping the app once in
`app/_layout.tsx`, each loaded from its repository on mount:

```
RecipeContext     — recipes: Recipe[]
                    actions: ADD_RECIPE, UPDATE_RECIPE, DELETE_RECIPE
                    backed by createDefaultRecipeRepository() (Plan 2)

PlanContext       — plan: MealPlan
                    actions: ADD_MEAL, REMOVE_MEAL, UPDATE_MEAL_SERVINGS
                    backed by a new createDefaultPlanRepository()

IngredientContext — userIngredients: Ingredient[], learnedPortions cache
                    actions: ADD_USER_INGREDIENT, LEARN_PORTION
                    exposes resolveIngredient(id) and searchAllIngredients(query)
                    backed by new UserIngredientRepository + LearnedPortionStore
```

Each action updates in-memory state and fires the matching repository write; screens
call Context actions, never `data/` functions directly. Contexts stay decoupled —
`PlanContext` stores only `{ recipeId, servings }` pairs; a screen that needs macros
or a grocery list combines `PlanContext` with `RecipeContext`/`IngredientContext`
itself (e.g. via a small combining hook), rather than the Contexts referencing each
other.

**Rejected alternative:** a state library (Zustand, Redux). Rejected per the parent
spec's constraint 3 (developer is new to programming, favour fewer moving parts) —
plain Context is built into React and sufficient at v1's scale (dozens to hundreds of
recipes, one plan).

---

## 4. Data & Persistence Extensions

Plan 2's `UserData`/`jsonFileStore`/`RecipeRepository` pattern extends rather than
duplicates. One JSON file remains the single source of truth for all user data, per
the parent spec §7:

```ts
// src/data/store/jsonFileStore.ts (extended)
export type UserData = {
  recipes: Recipe[];
  mealPlan: MealPlan;                              // auto-created empty on first read
  userIngredients: Ingredient[];                    // source: 'user'
  learnedPortions: Record<string, Portion[]>;       // keyed by ingredientId
};
```

**Required fix, not optional polish:** `recipeRepository.save`/`delete` currently
rebuild `UserData` as `{ recipes: [...] }`, discarding every other field. Once
`UserData` grows, that silently wipes `mealPlan`/`userIngredients`/`learnedPortions`
on every recipe save. Every repository's write path must spread the existing `data`
object and override only its own field: `{ ...data, recipes: [...] }`. This is called
out as its own task in the implementation plan, with a test that saving a recipe
preserves an already-stored plan/ingredient/portion — not left as an implicit
side-effect of adding new fields.

New repositories, same interface shape as `RecipeRepository`, same underlying file:

```ts
interface PlanRepository {
  get(): Promise<MealPlan>;                         // returns an empty plan if none stored
  save(plan: MealPlan): Promise<void>;
}

interface UserIngredientRepository {
  getAll(): Promise<Ingredient[]>;
  save(ingredient: Ingredient): Promise<void>;
}

interface LearnedPortionStore {
  getFor(ingredientId: string): Promise<Portion[]>;
  add(ingredientId: string, portion: Portion): Promise<void>;
}
```

### Ingredient resolution: unifying USDA, user, and learned data

USDA ingredients are read-only (bundled SQLite, Plan 2). A portion the user teaches
via the `NO_PORTION_DATA` flow cannot be written onto the ingredient itself, and per
the parent spec's Identity rules, ids are permanent — a learned portion must attach to
the *existing* `usda:<fdcId>` id, not spawn a second id for "the same food." One new
module resolves this, so screens never touch three sources directly:

```ts
// src/data/ingredients.ts
async function resolveIngredient(id: string): Promise<Ingredient | null>
// id starts with 'usda:' -> usda/database.ts lookup (Plan 2),
//   portions = [...base.portions, ...learnedPortions[id]]
// otherwise               -> userIngredients lookup by id,
//   portions = [...stored.portions, ...learnedPortions[id]]

async function searchAllIngredients(query: string): Promise<Ingredient[]>
// USDA sqlite search (searchIngredients, Plan 2) UNION userIngredients
//   filtered in-memory by substring match on name (small list, no index needed)
```

### Rejected alternative

**Clone a USDA ingredient into `userIngredients` on first manual entry**, attaching
the learned portion to the clone with a new id. Rejected because it breaks the
parent spec's id-permanence rule — two ids would refer to "the same food," and
grocery aggregation (which merges lines by `ingredientId`) would stop merging a
recipe using the original id with one using the clone.

---

## 5. Error Handling

UI-facing mapping of the domain's `AppError` (parent spec §8), each surfaced as a
specific interaction rather than a generic toast:

| `AppError.code` | UI response |
|---|---|
| `NO_PORTION_DATA` | Opens `manual-portion-prompt.tsx` ("How many grams is 1 {unit} of {ingredient}?"). On submit, calls `IngredientContext`'s `LEARN_PORTION` action (persists via `LearnedPortionStore.add`), then retries the amount entry — the unit is now available. |
| `INGREDIENT_NOT_FOUND` | Recipe detail/edit shows an inline "ingredient was removed" row with a "remove from recipe" action. Reachable only if a user-created ingredient was deleted while still referenced by a recipe. |
| `RECIPE_NOT_FOUND` | Plan screen shows a "recipe was deleted" row with a "remove from plan" action for that meal. Same pattern as above, one layer up. |
| `INVALID_AMOUNT` | Inline field validation on the scale-for-N and servings inputs rejects non-positive numbers before calling `scaleRecipe` — in practice this mostly never reaches the domain layer. |

Everything else (disk failure, corrupt JSON) is a genuine emergency per the parent
spec's dividing line (§8: expected failures → `Result`, emergencies → `throw`). One
top-level React error boundary in `app/_layout.tsx` catches these and shows a
generic "something went wrong, restart the app" screen — not handled per-screen.

### Amount-entry unit picker: steering around the failure, not just handling it

Given 84.8% of USDA foods have *some* usable portion but only 41.1% have a volume
portion (measured in Plan 2's final review), showing every unit and letting most
volume attempts fail into a prompt would make `NO_PORTION_DATA` the common case
rather than the fallback the parent spec describes it as. Instead, the unit picker
in `amount-entry.tsx` defaults to only the units the chosen ingredient's `Portion[]`
already supports, plus mass units (`g`/`kg`/`oz`/`lb`, which never need portion data).
A "use a different unit" escape hatch opens the full unit list; picking an
unsupported one from there is what triggers `NO_PORTION_DATA`. This keeps the
prompt meaningful (a deliberate "teach the app this unit" action) rather than a
frequent interruption, while still allowing it — matching the parent spec's framing
of the prompt as "asks a specific question," not a wall the user hits by accident.

---

## 6. Testing Strategy

Matches the parent spec §9's stated distribution. This plan adds no new domain
logic — Plan 1 already built `toGrams`/`calculateMacros`/`scaleRecipe`/
`buildGroceryList`, and this plan only calls them from screens.

- **`data/` (new repositories + `resolveIngredient`/`searchAllIngredients`):**
  integration tests against a temp directory, same pattern as Plan 2's
  `recipeRepository.test.ts` — real fs, no mocks. Specifically covers:
  - saving a recipe preserves an already-stored plan/ingredient/learned portion
    (the fix in §4, verified, not assumed)
  - `resolveIngredient` correctly merges base + learned portions for both a
    `usda:*` id and a user id
  - `searchAllIngredients` returns results from both sources and doesn't duplicate
    an ingredient that happens to match by name in both (shouldn't occur given
    disjoint id namespaces, but the test documents that assumption explicitly)
- **`ui/`:** a handful of smoke tests (screens render without crashing, key
  interactions fire the right Context action) — not TDD'd, per the parent spec.

---

## 7. Items to Verify During Implementation

1. **Expo Router version specifics.** AGENTS.md's "Expo HAS CHANGED" directive
   applies here more than anywhere else in this project so far — confirm current
   file-based routing conventions (route groups, modal presentation) against the
   pinned SDK version via the `expo-router` skill before writing screens, not from
   training-data memory.
2. **React Context re-render cost.** Not expected to matter at v1's scale (dozens to
   hundreds of recipes), but if `RecipeContext` updates cause visible jank on the
   Plan or Grocery screens, that's a signal to split it further (e.g. a separate
   context for the currently-edited recipe) — not a signal to reach for a state
   library preemptively.

---

## 8. Roadmap Beyond This Plan

Per the parent spec's dividing line: Plan 3 (this plan) covers the UI. Task-level
sequencing (how many implementation tasks, whether it's one plan or split into
sequential sub-plans like 3a/3b) is decided by `writing-plans`, not here — this
document fixes the design, not the task breakdown.

---

## 9. Addendum (2026-09-05): Status Before Plan 3b

Plan 3a (Recipe Book UI) shipped and merged to `main` 2026-09-03, and delivered
more of this spec's §3/§4 than its own task list named explicitly:

- `RecipeContext`, `IngredientContext`, `resolveIngredient`/`searchAllIngredients`,
  `UserIngredientRepository`, `LearnedPortionStore` — all built as designed here.
- The §4 "required fix" (every repository write spreads the existing `UserData`
  object rather than rebuilding it) is already in place in `recipeRepository.ts`
  and `userIngredientRepository.ts` — confirmed by reading the current code, not
  assumed.
- `UserData.mealPlan` already exists in the schema (`jsonFileStore.ts`), with an
  empty default (`{ id: 'default', name: 'This Week', meals: [] }`) — so no
  schema migration is needed for Plan 3b, only a repository to read/write it.

**Not yet built, i.e. Plan 3b's actual remaining scope:** `PlanRepository`,
`PlanContext`, the `(tabs)/` navigation restructuring (moving Plan 3a's routes
under `recipes/`, adding `plan/` and `grocery/`), the `plan/index.tsx` and
`grocery/index.tsx` screens, and the `RECIPE_NOT_FOUND` handling on the Plan
screen — everything else in this spec is already live.

**New scope this spec didn't anticipate:** Plan 3a's device testing (see
`docs/superpowers/plans/2026-09-01-recipe-book-ui.md`'s trailing notes) found
that `jsonFileStore.ts`'s write path (§4) shares one temp filename across every
repository with no concurrency guard. Harmless with 4 writers serialized by
`await`, but Plan 3b's `PlanRepository` is a 5th writer, which is when a
double-tap or two near-simultaneous writes can actually race and corrupt
`user-data.json`. **Decided:** fix this as part of Plan 3b, not deferred — add
a write-queue so every write to `user-data.json` serializes regardless of which
repository triggered it, addressed before or alongside `PlanRepository`'s own
task since that's the change that makes the race reachable.
