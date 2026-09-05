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
