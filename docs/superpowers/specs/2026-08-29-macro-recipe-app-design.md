# Macro Recipe App — v1 Design

**Date:** 2026-08-29
**Status:** Approved design, ready for implementation planning

---

## 1. Problem & Purpose

People who meal-prep and track macros currently juggle three tools: a recipe store
(notes app, screenshots, bookmarks), a macro calculator (MyFitnessPal), and a shopping
list (paper, Reminders). Nothing connects them, so planning a week means manually
converting every recipe into a shopping list and manually summing macros.

This app closes that loop: store recipes, plan a week of meals, and get an accurate
grocery list and macro breakdown automatically.

**Primary user:** someone health-conscious who meal-preps weekly and cares about
protein/carb/fat totals, not just calories.

---

## 2. Scope

### In scope for v1

- Recipe book: create, edit, delete, browse recipes stored on the device
- Ingredient search against a bundled USDA nutrition database
- Manual ingredient entry when USDA lacks an item
- Macro calculation per recipe and per serving
- Weekly meal planner: assign recipes and portion counts to a plan
- Grocery list generation: aggregate all planned ingredients into a shopping list
- Recipe scaling (a 4-serving recipe planned for 6 portions)

### Explicitly out of scope for v1

| Deferred | Reason |
|---|---|
| User accounts, backend, cloud sync | v1 needs no server, no privacy policy, no hosting cost |
| Ads and premium tier | Monetize after the core idea is validated |
| Pantry tracking ("I already have onions") | A filter on the end of the grocery pipeline; no type changes |
| Store-aisle grouping | Same — a presentation concern, additive |
| User-defined units ("1 can", "1 bunch") | Needs a user-managed unit registry and its own edit UI |
| Barcode scanning | Requires the ~2M-item USDA branded set, too large to bundle |
| iOS release | Codebase stays cross-platform; iOS is a build target flipped on later |

### Non-goals

- **Selling user data.** Apple App Store Guideline 5.1.2 and Google Play's User Data
  policy prohibit selling personal data to third parties. This was raised as a
  monetization idea and rejected as an app-store rejection risk, not a preference.
  Future monetization is ads plus a premium tier, with a first-party email list.

---

## 3. Constraints

- **Development machine is Arch Linux.** iOS cannot be built or run locally; that
  requires macOS, EAS Build (cloud), and a paid Apple Developer account. Android runs
  entirely locally and free.
- **Developer is new to programming.** Incidental complexity is a real cost — every
  added tool must be learned alongside the problem itself. Design decisions favour
  fewer moving parts over theoretically-superior-but-heavier options.
- **Test-driven development throughout**, which requires a fast feedback loop as a
  hard architectural requirement, not a nice-to-have.
- **Offline-first.** The app must be fully functional with no network connection.

---

## 4. Architecture

Layered, with a dependency rule pointing inward.

```
src/
  domain/              plain TypeScript. NO react / react-native imports, ever.
    units/             Unit, Quantity, toGrams()
    ingredients/       Ingredient, Nutrition, Portion
    recipes/           Recipe, calculateMacros(), scaleRecipe()
    plan/              MealPlan, PlannedMeal
    grocery/           buildGroceryList()
  data/
    usda/              read-only bundled food database
    store/             persistence for user recipes & plans
  ui/                  screens and components
```

**The rule:** nothing under `src/domain/` may import React or React Native.
Enforced by an ESLint `no-restricted-imports` rule, not by convention.

**Rationale.** The hard problems here are logic problems, not UI problems — merging
300 g of flour with 2 cups of flour into one shopping-list line has nothing to do with
rendering. Isolating that logic means:

- Domain tests run in milliseconds with no emulator, making the TDD loop viable
- The rules survive any UI redesign
- The logic could later move to a server or a website unchanged

### Rejected alternatives

- **Feature-sliced** (`features/recipes/`, `features/planner/`): unit and macro maths
  are needed by every feature, so they collapse into a `shared/` folder that becomes
  the domain core anyway — discovered late, with worse boundaries.
- **Logic in React hooks** (`useGroceryList()`): testing requires rendering in a fake
  React environment, so a bug in gram arithmetic is debugged through React. Also welds
  business rules to React permanently. This is the most common pattern in online
  tutorials and is consciously rejected.

---

## 5. Domain Model

```ts
type Nutrition = {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

type Portion = {
  label: string          // "cup, chopped" | "medium" | "tbsp"
  gramsPerUnit: number   // 160
}

type Ingredient = {
  id: string
  name: string
  nutritionPer100g: Nutrition   // basis is in the field name, deliberately
  portions: Portion[]
  source: 'usda' | 'user'
}

type Unit =
  | { kind: 'mass';   symbol: 'g' | 'kg' | 'oz' | 'lb' }
  | { kind: 'volume'; symbol: 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz' }
  | { kind: 'count';  label: string }

type Quantity = {
  grams: number                           // canonical — all maths uses this
  input: { amount: number; unit: Unit }   // as typed — display only
}

type RecipeIngredient = {
  ingredientId: string
  quantity: Quantity
}

type Recipe = {
  id: string
  name: string
  servings: number
  ingredients: RecipeIngredient[]
  steps: string[]
}

type PlannedMeal = { recipeId: string; servings: number }
type MealPlan    = { id: string; name: string; meals: PlannedMeal[] }

type GroceryLine = {
  ingredientId: string
  name: string           // resolved from the Ingredient at build time
  totalGrams: number
  display: string        // "1.8 kg"
}
type GroceryList = { lines: GroceryLine[] }
```

### Identity

- **USDA ingredients** use `usda:<fdcId>` as their `id`, so the same food always
  resolves to the same identifier and grocery aggregation merges correctly.
- **User-created ingredients, recipes and plans** use a UUID generated on the device
  (`expo-crypto`'s `randomUUID`). No central authority exists in v1 and none is needed.
- Ids are permanent. Renaming an ingredient never changes its id, otherwise recipes
  referencing it would break.

### Constraint on `count` units

A `count` unit's `label` must match the label of an existing `Portion` on that
ingredient — either one supplied by USDA or one the user has already added through
the `NO_PORTION_DATA` prompt. Users cannot invent an arbitrary count label inline.

This is what keeps user-defined units genuinely out of v1 scope: the `count` kind
exists to consume USDA portion data such as `"medium"`, not to provide a free-text
unit registry. Custom units like `"1 can"` remain a v1.1 feature.

### Design notes

**`nutritionPer100g` names its basis.** Confusing per-serving with per-100 g values is
the most common defect class in nutrition apps. Encoding the basis in the field name
makes it unmisreadable at every call site.

**`Unit` is a discriminated union.** The three kinds convert by genuinely different
rules, so TypeScript must reject a `switch` that forgets one. Exhaustiveness checking
is a correctness guarantee here, not a style preference.

**`Quantity` stores both canonical and input.** `grams` drives all computation;
`input` preserves "2 cups" so recipes read as authored. `grams` is frozen at entry
time on purpose — if USDA later revises a portion weight, existing recipes must keep
meaning what they meant when written.

---

## 6. Core Algorithms

### 6.1 Unit conversion

```ts
toGrams(amount: number, unit: Unit, ingredient: Ingredient): Result<number>
```

The signature requires the ingredient. This is not incidental: volume→mass and
count→mass conversions are ingredient-specific (1 cup of water ≈ 236 g, 1 cup of
flour ≈ 120 g, 1 cup of honey ≈ 340 g). There is no universal `cupsToGrams()`.

1. **mass** — pure arithmetic against fixed factors. Ingredient irrelevant. Always succeeds.
2. **volume** — find any volume `Portion` on the ingredient (e.g. `"cup" = 120 g`),
   convert the requested amount into that portion's unit by pure volume ratio
   (`4 tbsp = 0.25 cup`), then multiply (`0.25 × 120 = 30 g`).
3. **count** — match a `Portion` by label (`"medium" = 110 g`), multiply.
4. **otherwise** — return `NO_PORTION_DATA`.

Only **one** volume portion per ingredient is ever required, because volume↔volume
conversion is universal. USDA's "1 cup" entry yields tbsp, tsp, ml and floz for free.

**Conversion factors** (US customary, exact by definition):

| Mass | grams | Volume | ml |
|---|---|---|---|
| g | 1 | ml | 1 |
| kg | 1000 | l | 1000 |
| oz | 28.349523125 | tsp | 4.92892159375 |
| lb | 453.59237 | tbsp | 14.78676478125 |
| | | floz | 29.5735295625 |
| | | cup | 236.5882365 |

**Ratio-based conversion is required, not absolute-ml conversion.** The US customary
cup (236.5882365 ml) differs from the US *legal* cup (240 ml) used in nutrition
labelling, and USDA portion labels may use either. Converting by ratio sidesteps the
ambiguity entirely, because the relationships hold in both systems
(1 cup = 16 tbsp = 48 tsp regardless). Never convert a volume to absolute millilitres
and then to grams via an assumed density.

### 6.2 Macro calculation

```
recipeMacros = Σ over ingredients of (quantity.grams / 100) × ingredient.nutritionPer100g
perServing   = recipeMacros / recipe.servings
```

### 6.3 Recipe scaling

```ts
scaleRecipe(recipe: Recipe, desiredServings: number): Result<Recipe>
```

```
factor = desiredServings / recipe.servings
scaled = every ingredient's quantity.grams × factor
```

Scaling returns a **new** `Recipe` value and never mutates the stored one. A meal plan
records `{ recipeId, servings }`, not a scaled copy — the scaled version is derived
whenever it is needed. This keeps one authoritative definition of each recipe.

`input` is recomputed for display but is not authoritative; `grams` is.

Returns `INVALID_AMOUNT` if `desiredServings` is zero or negative.

### 6.4 Grocery aggregation

```ts
buildGroceryList(
  plan: MealPlan,
  recipes: ReadonlyMap<string, Recipe>,
  ingredients: ReadonlyMap<string, Ingredient>
): Result<GroceryList>
```

Recipes and ingredients are passed in as lookup maps rather than fetched inside the
function. This is what keeps the domain free of storage concerns and lets the whole
pipeline be tested with plain object literals.

Returns `INGREDIENT_NOT_FOUND` or `RECIPE_NOT_FOUND` if the plan references something
missing — possible if a recipe was deleted while still planned.

```
MealPlan
  → scale each recipe to its planned servings
  → flatten to (ingredientId, grams) pairs
  → group by ingredientId
  → sum grams
  → format for display
  → GroceryList
```

Every stage is a pure function: same input, same output, no database, no screen, no
clock. This is the direct payoff of canonical-gram storage — scaling, merging and
summing are plain arithmetic on one number. Had quantities been stored as "2 cups",
each stage would require the converter, the ingredient, and its own error path.

Display formatting picks a readable unit at the very end (`1840 g → "1.8 kg"`). This
is presentation only and never affects storage.

---

## 7. Persistence

Two stores, because the two datasets have opposite characteristics.

| | USDA food data | User recipes & plans |
|---|---|---|
| Size | ~8,000 rows | dozens to a few hundred |
| Written by | nobody — ships with the app | the user, constantly |
| Needs search | yes, by name | no |
| On app update | replaced | must never be lost |

### USDA → bundled read-only SQLite

`assets/usda.db`, generated by a build-time import script, shipped inside the app and
read via `expo-sqlite` + `expo-asset`. Searching 8k rows by name is exactly SQLite's
job, and querying on demand avoids holding the dataset in memory.

Being read-only removes SQLite's usual costs: no writes, no transactions, and
**no schema migrations**.

### User data → a single JSON file

Written via `expo-file-system`, cached in memory while the app runs. Writes go to a
temporary file which is then renamed over the real one; rename is atomic, so an
interrupted write leaves the previous file intact rather than a truncated one.

**This is a deliberate trade of "proper" for "learnable."** At ~500 recipes (~1 MB) a
plain `.filter()` is instant and a full rewrite on save is imperceptible, while the
approach avoids SQL, schemas, migrations, and async queries threaded through the UI.

**Known ceiling:** thousands of recipes, or v1.1 cloud sync requiring per-record change
tracking. Both are far beyond v1.

### The seam that makes replacement cheap

```ts
interface RecipeRepository {
  getAll(): Promise<Recipe[]>
  save(recipe: Recipe): Promise<void>
  delete(id: string): Promise<void>
}
```

The domain declares what it needs; `data/` decides how. Tests use an in-memory fake,
so neither the domain nor its tests ever touch disk. Swapping the JSON store for
SQLite later changes one implementation file.

---

## 8. Error Handling

```ts
type Result<T, E = AppError> =
  | { ok: true;  value: T }
  | { ok: false; error: E }

type AppError =
  | { code: 'NO_PORTION_DATA';     ingredientId: string; unit: Unit }
  | { code: 'INGREDIENT_NOT_FOUND'; ingredientId: string }
  | { code: 'RECIPE_NOT_FOUND';     recipeId: string }
  | { code: 'INVALID_AMOUNT';       amount: number }
```

Each error carries the data the UI needs to act. `NO_PORTION_DATA` includes both the
ingredient and the unit that failed, so the prompt can ask a specific question —
"how many grams is 1 cup of oats?" — rather than a generic error.

TypeScript does not track thrown types: nothing in a signature warns that `toGrams`
can fail, and nothing forces a caller to handle it. With `Result`, failure appears in
the return type and the compiler refuses `.value` access before an `.ok` check.

**The dividing line:**

- **Expected failures → `Result`.** `NO_PORTION_DATA`, `INGREDIENT_NOT_FOUND`,
  `INVALID_AMOUNT`. These are normal events. The domain returns them; the UI decides
  what to show. `NO_PORTION_DATA` specifically drives a prompt asking the user for a
  gram weight once, which is then stored in their ingredient library permanently.
- **Genuine emergencies → `throw`.** Disk failure, corrupted database. There is nothing
  sensible to do locally; an error boundary catches them.

Wrapping everything in `Result` is as wrong as wrapping nothing — it relocates noise
rather than removing it.

---

## 9. Testing Strategy

**One runner: Jest, via the `jest-expo` preset.** It handles both plain-TypeScript
domain tests and React Native tests, giving one config and one command. A second,
faster runner for pure TS was considered and rejected as unnecessary complexity.

| Layer | Approach | Speed |
|---|---|---|
| `domain/` | Strict TDD. The large majority of tests. | milliseconds |
| `data/` | A few integration tests against a temp directory | fast |
| `ui/` | A handful of smoke tests. Not TDD'd. | slow |

The distribution is deliberate: UI tests are slow and break whenever a button moves,
while logic tests are fast and break only when behaviour genuinely changes. Pushing
correctness down into the cheap-to-test layer is the same decision as the domain-core
architecture, viewed from the testing side.

**Loop:** RED → GREEN → REFACTOR. The failing run in step 1 is mandatory — a test that
passes before its implementation exists is testing nothing.

**First test:** mass conversion (`2 kg → 2000 g`), the only branch of `toGrams` that
requires no ingredient portion data.

**Boundary enforcement:** an ESLint `no-restricted-imports` rule forbids `react` and
`react-native` imports inside `src/domain/`.

---

## 10. Tooling

- **Expo (managed workflow) + React Native + TypeScript**
- **Target:** Android first; codebase kept cross-platform so iOS becomes a build target
- **Node 26 / npm** (the machine has no bun, pnpm or yarn)
- **Jest** with the `jest-expo` preset
- **ESLint** with `no-restricted-imports` for the domain boundary
- **`expo-sqlite`, `expo-asset`, `expo-file-system`**

Scaffolding must route through the `expo:expo-overview` skill, which carries the
current SDK version and shared setup rules. Do not pin an SDK version from memory.

---

## 11. Items to Verify During Implementation

These were stated from general knowledge during design and must be confirmed before
being relied upon:

1. **USDA FoodData Central record counts.** SR Legacy is believed to be ~7,800 foods
   and the branded set ~2M. Confirm against the current dataset before choosing the
   subset to bundle.
2. **USDA licence terms.** Believed public domain as a US government work. Confirm
   current terms permit commercial redistribution.
3. **Bundled database size.** The ~10–40 MB estimate for the curated subset must be
   measured, since it directly affects app download size.
4. **`foodPortions` coverage.** The volume→mass path depends on USDA supplying at least
   one volume portion per food. Measure what fraction of the chosen subset actually
   has one; this determines how often users hit the manual-entry prompt.

Item 4 is the highest-risk assumption in this design. If coverage is poor, the manual
gram-weight prompt becomes a frequent interruption rather than a rare fallback, and
the ingredient-search UX needs rethinking.

---

## 12. Roadmap Beyond v1

```
v1     recipes + macros + planner + grocery list, on-device
v1.1   pantry tracking, aisle grouping, custom units
v1.2   accounts + cloud sync  (GDPR/CCPA obligations attach here)
v1.3   ads + premium tier
v2     iOS release, barcode scanning
```
