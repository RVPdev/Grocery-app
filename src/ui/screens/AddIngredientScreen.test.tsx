import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';
import { AddIngredientScreen, availableUnits } from './AddIngredientScreen';
import { IngredientProvider } from '../context/IngredientContext';
import { DraftRecipeProvider, useDraftRecipe } from '../context/DraftRecipeContext';
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

// Deliberately has NO portions at all, so any non-mass unit is guaranteed to
// hit NO_PORTION_DATA on the first attempt — used to force the learn-portion
// detour deterministically in the regression test below.
const flour: Ingredient = {
  id: 'usda:2002', name: 'Flour, plain',
  nutritionPer100g: { kcal: 364, proteinG: 10, carbsG: 76, fatG: 1 },
  portions: [],
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
  searchAllIngredients: jest.fn(async (query: string) => {
    if (query === 'oat') return [oats];
    if (query === 'flour') return [flour];
    return [];
  }),
}));

// Test-only probe rendered alongside the screen, inside the same
// DraftRecipeProvider, so tests can inspect what addIngredientLine actually
// committed to the draft without reaching into the context module directly.
function DraftProbe() {
  const { draft } = useDraftRecipe();
  return <Text testID="draft-lines">{JSON.stringify(draft.ingredientLines)}</Text>;
}

function TestHarness(
  { learnedPortionStore, screenKey }: { learnedPortionStore: LearnedPortionStore; screenKey?: string },
) {
  return (
    <IngredientProvider userIngredientRepository={fakeUserIngredientRepo()} learnedPortionStore={learnedPortionStore}>
      <DraftRecipeProvider>
        <AddIngredientScreen key={screenKey} />
        <DraftProbe />
      </DraftRecipeProvider>
    </IngredientProvider>
  );
}

describe('availableUnits', () => {
  it('does not offer two units with the same label when portions have duplicate count-style labels', () => {
    const ambiguousBar: Ingredient = {
      id: 'usda:9001', name: 'Ambiguous bar',
      nutritionPer100g: { kcal: 200, proteinG: 5, carbsG: 20, fatG: 8 },
      portions: [
        { label: '1 bar', unit: { kind: 'count', label: 'bar' }, gramsPerUnit: 40 },
        { label: '1 bar (large)', unit: { kind: 'count', label: 'bar' }, gramsPerUnit: 55 },
      ],
      source: 'usda',
    };

    const units = availableUnits(ambiguousBar);
    const barUnits = units.filter((u) => u.kind === 'count' && u.label === 'bar');

    expect(barUnits).toHaveLength(1);
  });
});

describe('AddIngredientScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

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

  it('learn-portion step: teaching a portion updates local ingredient state so retrying "Add to recipe" with the same unit succeeds instead of bouncing back to learn-portion again', async () => {
    const learnedPortionStore = fakeLearnedPortionStore();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<TestHarness learnedPortionStore={learnedPortionStore} />);
    });

    function findPressableByText(text: string) {
      return tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === text));
    }

    const searchInput = tree!.root.findByType(TextInput);
    await act(async () => {
      searchInput.props.onChangeText('flour');
    });

    const resultButton = findPressableByText('Flour, plain');
    act(() => {
      resultButton?.props.onPress();
    });

    // Flour has no portions at all, so only mass units are offered by
    // default. Reveal the full unit list and pick a non-mass unit (ml) —
    // guaranteed to hit NO_PORTION_DATA on the first conversion attempt.
    act(() => {
      findPressableByText('Use a different unit')?.props.onPress();
    });
    act(() => {
      findPressableByText('ml')?.props.onPress();
    });

    const amountInput = tree!.root.findAllByType(TextInput).find((i) => i.props.keyboardType === 'numeric');
    act(() => {
      amountInput?.props.onChangeText('100');
    });

    await act(async () => {
      await findPressableByText('Add to recipe')?.props.onPress();
    });

    // First attempt: no volume portion exists yet, so this must land on
    // learn-portion rather than completing.
    expect(mockBack).not.toHaveBeenCalled();
    expect(tree!.root.findAllByType(Text).some((t) => t.props.children === 'Save and continue')).toBe(true);

    const gramsPerUnitInput = tree!.root.findAllByType(TextInput).find((i) => i.props.keyboardType === 'numeric');
    act(() => {
      gramsPerUnitInput?.props.onChangeText('5');
    });

    await act(async () => {
      await findPressableByText('Save and continue')?.props.onPress();
    });

    expect(learnedPortionStore.added).toHaveLength(1);

    // Back on the amount step, chosenUnit (ml) and amountText (100) are
    // preserved. Retry "Add to recipe": with the fix, the just-taught
    // portion was merged into local ingredient state, so toGrams succeeds
    // this time instead of hitting NO_PORTION_DATA again and bouncing back
    // to learn-portion a second time (which is the bug being regression
    // tested here).
    await act(async () => {
      await findPressableByText('Add to recipe')?.props.onPress();
    });

    expect(mockBack).toHaveBeenCalled();

    const probe = tree!.root.findAllByType(Text).find((t) => t.props.testID === 'draft-lines');
    const lines = JSON.parse(probe!.props.children as string);
    expect(lines).toHaveLength(1);
    expect(lines[0].ingredientId).toBe('usda:2002');
    expect(lines[0].quantity.grams).toBe(500); // 100 ml * 5 g/ml, from the taught portion
  });

  it('refuses to add an ingredient a second time instead of creating a duplicate line', async () => {
    const learnedPortionStore = fakeLearnedPortionStore();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<TestHarness learnedPortionStore={learnedPortionStore} screenKey="first" />);
    });

    function findPressableByText(text: string) {
      return tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === text));
    }

    async function addOats(amount: string) {
      const searchInput = tree!.root.findByType(TextInput);
      await act(async () => {
        searchInput.props.onChangeText('oat');
      });
      act(() => {
        findPressableByText('Oats, raw')?.props.onPress();
      });
      act(() => {
        findPressableByText('g')?.props.onPress();
      });
      const amountInput = tree!.root.findAllByType(TextInput).find((i) => i.props.keyboardType === 'numeric');
      act(() => {
        amountInput?.props.onChangeText(amount);
      });
      await act(async () => {
        await findPressableByText('Add to recipe')?.props.onPress();
      });
    }

    await addOats('80');
    expect(mockBack).toHaveBeenCalledTimes(1);

    // Simulate leaving the screen (real navigation back to the recipe editor)
    // and opening a fresh "Add ingredient" screen — a new component instance
    // with reset local state, sharing the same DraftRecipeProvider above the
    // router, exactly like the real app.
    act(() => {
      tree!.update(<TestHarness learnedPortionStore={learnedPortionStore} screenKey="second" />);
    });

    await addOats('50');

    // Still only the one successful add from before — the second attempt
    // must be refused, not appended as a duplicate line.
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(
      tree!.root.findAllByType(Text).some((t) => t.props.children === 'This ingredient is already in the recipe. Remove it first to change the amount.'),
    ).toBe(true);

    const probe = tree!.root.findAllByType(Text).find((t) => t.props.testID === 'draft-lines');
    const lines = JSON.parse(probe!.props.children as string);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity.input.amount).toBe(80);
  });
});
