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
