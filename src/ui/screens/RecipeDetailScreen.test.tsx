import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';
import { RecipeDetailScreen } from './RecipeDetailScreen';
import { RecipeProvider } from '../context/RecipeContext';
import { IngredientProvider } from '../context/IngredientContext';
import type { RecipeRepository, UserIngredientRepository, LearnedPortionStore } from '../../data/index';
import type { Recipe } from '../../domain/recipes/types';
import type { Ingredient } from '../../domain/ingredients/types';

let mockParams = { id: 'recipe-1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, raw',
  nutritionPer100g: { kcal: 389, proteinG: 17, carbsG: 66, fatG: 7 }, portions: [], source: 'usda',
};

const porridge: Recipe = {
  id: 'recipe-1', name: 'Porridge', servings: 2,
  ingredients: [{ ingredientId: 'usda:1001', quantity: { grams: 160, input: { amount: 160, unit: { kind: 'mass', symbol: 'g' } } } }],
  steps: ['Simmer.'],
};

function fakeRecipeRepo(initial: Recipe[]): RecipeRepository {
  return { async getAll() { return initial; }, async save() {}, async delete() {} };
}
function fakeUserIngredientRepo(): UserIngredientRepository {
  return { async getAll() { return []; }, async save() {} };
}
function fakeLearnedPortionStore(): LearnedPortionStore {
  return { async getFor() { return []; }, async add() {} };
}

jest.mock('../../data/index', () => {
  const actual = jest.requireActual('../../data/index');
  return { ...actual, resolveIngredient: jest.fn(async (id: string) => (id === 'usda:1001' ? oats : null)) };
});

// react-test-renderer under this project's React/RN versions can't run Pressable's
// internal hooks (see Task 10's RecipeListScreen.test.tsx for the same issue) — swap
// in a plain View that forwards onPress/style/children so behavior is still testable.
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

function renderScreen(recipe: Recipe) {
  return renderer.create(
    <RecipeProvider repository={fakeRecipeRepo([recipe])}>
      <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={fakeLearnedPortionStore()}>
        <RecipeDetailScreen />
      </IngredientProvider>
    </RecipeProvider>,
  );
}

describe('RecipeDetailScreen', () => {
  it('shows the recipe name and per-serving macros once ingredients resolve', async () => {
    mockParams = { id: 'recipe-1' };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen(porridge);
    });
    const text = tree!.root.findAllByType(Text).map((n) => n.props.children).join(' ');
    expect(text).toContain('Porridge');
    expect(text).toContain('kcal');
  });

  it('shows a removable row when an ingredient cannot be resolved', async () => {
    mockParams = { id: 'recipe-1' };
    const broken: Recipe = { ...porridge, ingredients: [{ ingredientId: 'usda:missing', quantity: porridge.ingredients[0].quantity }] };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen(broken);
    });
    const text = tree!.root.findAllByType(Text).map((n) => n.props.children).join(' ');
    expect(text).toContain('ingredient was removed');
  });

  it('persists the recipe without the missing ingredient when "Remove from recipe" is pressed', async () => {
    mockParams = { id: 'recipe-1' };
    const broken: Recipe = { ...porridge, ingredients: [{ ingredientId: 'usda:missing', quantity: porridge.ingredients[0].quantity }] };
    const saveCalls: Recipe[] = [];
    const repo: RecipeRepository = {
      async getAll() { return [broken]; },
      async save(recipe) { saveCalls.push(recipe); },
      async delete() {},
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={repo}>
          <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={fakeLearnedPortionStore()}>
            <RecipeDetailScreen />
          </IngredientProvider>
        </RecipeProvider>,
      );
    });

    const removeButton = tree!.root.findAllByType(Pressable).find((node) =>
      node.findAllByType(Text).some((t) => t.props.children === 'Remove from recipe'),
    );
    expect(removeButton).toBeDefined();

    await act(async () => {
      await removeButton!.props.onPress();
    });

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].ingredients).toEqual([]);

    const textAfterRemoval = tree!.root.findAllByType(Text).map((n) => n.props.children).join(' ');
    expect(textAfterRemoval).not.toContain('ingredient was removed');
  });
});
