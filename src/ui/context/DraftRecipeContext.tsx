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
