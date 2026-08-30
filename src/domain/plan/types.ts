export type PlannedMeal = {
  recipeId: string;
  servings: number;
};

export type MealPlan = {
  id: string;
  name: string;
  meals: PlannedMeal[];
};
