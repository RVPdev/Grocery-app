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
  let currentPlan = plan;
  return {
    saved,
    async get() { return currentPlan; },
    async save(p) { saved.push(p); currentPlan = p; },
    async update(mutate) {
      const nextPlan = mutate(currentPlan);
      saved.push(nextPlan);
      currentPlan = nextPlan;
      return nextPlan;
    },
  };
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
