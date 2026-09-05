jest.mock('../../data/index', () => {
  const actual = jest.requireActual('../../data/index');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { oats } = require('../../domain/testing/fixtures');
  return {
    ...actual,
    resolveIngredient: jest.fn(async (id: string) => (id === oats.id ? oats : null)),
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { GroceryScreen } from './GroceryScreen';
import { PlanProvider } from '../context/PlanContext';
import { RecipeProvider } from '../context/RecipeContext';
import { IngredientProvider } from '../context/IngredientContext';
import type {
  PlanRepository, RecipeRepository, UserIngredientRepository, LearnedPortionStore,
} from '../../data/index';
import type { MealPlan } from '../../domain/plan/types';
import type { Recipe } from '../../domain/recipes/types';
import { oats, porridge } from '../../domain/testing/fixtures';

function fakeRecipeRepo(recipes: Recipe[]): RecipeRepository {
  return { async getAll() { return recipes; }, async save() {}, async delete() {} };
}
function fakePlanRepo(plan: MealPlan): PlanRepository {
  return { async get() { return plan; }, async save() {}, async update(mutate) { return mutate(plan); } };
}
function fakeUserIngredientRepo(): UserIngredientRepository {
  return { async getAll() { return []; }, async save() {} };
}
function fakeLearnedPortionStore(): LearnedPortionStore {
  return { async getFor() { return []; }, async add() {} };
}

function Harness({ plan, recipes = [] }: { plan: MealPlan; recipes?: Recipe[] }) {
  return (
    <RecipeProvider repository={fakeRecipeRepo(recipes)}>
      <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={fakeLearnedPortionStore()}>
        <PlanProvider repository={fakePlanRepo(plan)}>
          <GroceryScreen />
        </PlanProvider>
      </IngredientProvider>
    </RecipeProvider>
  );
}

describe('GroceryScreen', () => {
  it('shows an empty-state message for a plan with no meals', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness plan={{ id: 'default', name: 'This Week', meals: [] }} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names.some((n) => typeof n === 'string' && n.includes('No meals planned'))).toBe(true);
  });

  it('renders an aggregated grocery line for a planned recipe', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: porridge.id, servings: 2 }] };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness plan={plan} recipes={[porridge]} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names).toContain(oats.name);
  });

  it('shows a friendly message instead of crashing when a planned recipe was deleted', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'ghost', servings: 1 }] };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness plan={plan} recipes={[]} />);
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names.some((n) => typeof n === 'string' && n.includes('Remove it from your plan'))).toBe(true);
  });
});
