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
