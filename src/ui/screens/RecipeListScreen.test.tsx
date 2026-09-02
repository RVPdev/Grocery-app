import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';
import { RecipeListScreen } from './RecipeListScreen';
import { RecipeProvider } from '../context/RecipeContext';
import type { RecipeRepository } from '../../data/index';
import type { Recipe } from '../../domain/recipes/types';

jest.mock('expo-router');

import * as expoRouter from 'expo-router';

const pushMock = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(expoRouter.useRouter as any).mockReturnValue({ push: pushMock });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(expoRouter.Link as any).mockImplementation(
  ({ children }: { href: string; children: React.ReactNode }) => children
);

jest.mock('react-native/Libraries/Lists/FlatList', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');

  return {
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: ({ data, renderItem, keyExtractor, ...props }: any) =>
      React.createElement(
        View,
        props,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.map((item: any) =>
          React.createElement(React.Fragment, { key: keyExtractor(item) }, renderItem({ item }))
        )
      ),
  };
});

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

const porridge: Recipe = { id: 'recipe-1', name: 'Porridge', servings: 2, ingredients: [], steps: [] };

function fakeRepository(initial: Recipe[]): RecipeRepository {
  return {
    async getAll() {
      return initial;
    },
    async save() {},
    async delete() {},
  };
}

describe('RecipeListScreen', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders each recipe name', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository([porridge])}>
          <RecipeListScreen />
        </RecipeProvider>,
      );
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names).toContain('Porridge');
  });

  it('renders an empty-state message when there are no recipes', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository([])}>
          <RecipeListScreen />
        </RecipeProvider>,
      );
    });
    const names = tree!.root.findAllByType(Text).map((n) => n.props.children);
    expect(names.some((n) => typeof n === 'string' && n.includes('No recipes yet'))).toBe(true);
  });

  it('renders a Pressable per recipe row', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository([porridge])}>
          <RecipeListScreen />
        </RecipeProvider>,
      );
    });
    expect(tree!.root.findAllByType(Pressable)).toHaveLength(1);
  });

  it('navigates to the recipe detail route when a row is pressed', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={fakeRepository([porridge])}>
          <RecipeListScreen />
        </RecipeProvider>,
      );
    });
    act(() => {
      tree!.root.findAllByType(Pressable)[0].props.onPress();
    });
    expect(pushMock).toHaveBeenCalledWith('/recipe-1');
  });
});
