import { randomUUID as mockRandomUUID } from 'node:crypto';
jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

jest.mock('expo-router');

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';
import * as expoRouter from 'expo-router';
import { RecipeEditScreen } from './RecipeEditScreen';
import { RecipeProvider } from '../context/RecipeContext';
import { DraftRecipeProvider } from '../context/DraftRecipeContext';
import type { RecipeRepository } from '../../data/index';

const mockPush = jest.fn();
const mockBack = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(expoRouter.useRouter as any).mockReturnValue({ push: mockPush, back: mockBack });

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

function fakeRepository(): RecipeRepository & { saved: unknown[] } {
  const saved: unknown[] = [];
  return { saved, async getAll() { return []; }, async save(r) { saved.push(r); }, async delete() {} };
}

describe('RecipeEditScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('renders name, servings, and steps inputs', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository()}>
          <DraftRecipeProvider>
            <RecipeEditScreen />
          </DraftRecipeProvider>
        </RecipeProvider>,
      );
    });
    expect(tree!.root.findAllByType(TextInput).length).toBeGreaterThanOrEqual(2);
  });

  it('renders a button that navigates to the add-ingredient flow', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository()}>
          <DraftRecipeProvider>
            <RecipeEditScreen />
          </DraftRecipeProvider>
        </RecipeProvider>,
      );
    });
    const addButton = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Add ingredient'));
    act(() => {
      addButton?.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/add-ingredient');
  });

  it('saving calls the repository with a recipe built from the draft', async () => {
    const repo = fakeRepository();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={repo}>
          <DraftRecipeProvider>
            <RecipeEditScreen />
          </DraftRecipeProvider>
        </RecipeProvider>,
      );
    });
    const nameInput = tree!.root.findAllByType(TextInput)[0];
    act(() => {
      nameInput.props.onChangeText('Porridge');
    });
    const saveButton = tree!.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === 'Save'));
    await act(async () => {
      await saveButton?.props.onPress();
    });
    expect(repo.saved).toHaveLength(1);
    expect((repo.saved[0] as { name: string }).name).toBe('Porridge');
    expect(mockBack).toHaveBeenCalled();
  });
});
