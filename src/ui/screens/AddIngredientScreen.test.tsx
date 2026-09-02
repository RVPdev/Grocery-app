import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';
import { AddIngredientScreen } from './AddIngredientScreen';
import { IngredientProvider } from '../context/IngredientContext';
import { DraftRecipeProvider } from '../context/DraftRecipeContext';
import type { UserIngredientRepository, LearnedPortionStore } from '../../data/index';
import type { Ingredient } from '../../domain/ingredients/types';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

// The installed react-native's Pressable crashes under react-test-renderer
// here with "Invalid hook call" (useRef resolving to null) — the same issue
// worked around in RecipeEditScreen.test.tsx, RecipeDetailScreen.test.tsx,
// and RecipeListScreen.test.tsx. Stand in a plain View-based Pressable.
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

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, raw',
  nutritionPer100g: { kcal: 389, proteinG: 17, carbsG: 66, fatG: 7 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 40 }],
  source: 'usda',
};

function fakeUserIngredientRepo(): UserIngredientRepository {
  return { async getAll() { return []; }, async save() {} };
}
function fakeLearnedPortionStore(): LearnedPortionStore & { added: unknown[] } {
  const added: unknown[] = [];
  return { added, async getFor() { return []; }, async add(...args) { added.push(args); } };
}

jest.mock('../../data/index', () => ({
  ...jest.requireActual('../../data/index'),
  searchAllIngredients: jest.fn(async (query: string) => (query === 'oat' ? [oats] : [])),
}));

function TestHarness({ learnedPortionStore }: { learnedPortionStore: LearnedPortionStore }) {
  return (
    <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={learnedPortionStore}>
      <DraftRecipeProvider>
        <AddIngredientScreen />
      </DraftRecipeProvider>
    </IngredientProvider>
  );
}

describe('AddIngredientScreen', () => {
  it('search step: typing a query and picking a result advances to amount entry, then adding commits the line and goes back', async () => {
    const learnedPortionStore = fakeLearnedPortionStore();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<TestHarness learnedPortionStore={learnedPortionStore} />);
    });

    const searchInput = tree!.root.findByType(TextInput);
    await act(async () => {
      searchInput.props.onChangeText('oat');
    });

    const resultButton = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Oats, raw'));
    act(() => {
      resultButton?.props.onPress();
    });

    // Now on the amount step: mass units are always offered.
    const gramsOption = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'g'));
    act(() => {
      gramsOption?.props.onPress();
    });
    const amountInput = tree!.root.findAllByType(TextInput).find((i) => i.props.keyboardType === 'numeric');
    act(() => {
      amountInput?.props.onChangeText('80');
    });
    const confirmButton = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Add to recipe'));
    await act(async () => {
      await confirmButton?.props.onPress();
    });

    expect(mockBack).toHaveBeenCalled();
  });
});
