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
      const idx = state.recipes.findIndex((r) => r.id === action.recipe.id);
      if (idx >= 0) {
        const newRecipes = [...state.recipes];
        newRecipes[idx] = action.recipe;
        return { ...state, recipes: newRecipes };
      }
      return { ...state, recipes: [...state.recipes, action.recipe] };
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
