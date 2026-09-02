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
