import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { recipeReducer, RecipeProvider, useRecipes } from './RecipeContext';
import type { RecipeRepository } from '../../data/index';
import type { Recipe } from '../../domain/recipes/types';

const porridge: Recipe = { id: 'recipe-1', name: 'Porridge', servings: 2, ingredients: [], steps: [] };
const soup: Recipe = { id: 'recipe-2', name: 'Soup', servings: 4, ingredients: [], steps: [] };

describe('recipeReducer', () => {
  it('SET_ALL replaces the list', () => {
    const state = recipeReducer({ recipes: [], loading: true }, { type: 'SET_ALL', recipes: [porridge] });
    expect(state).toEqual({ recipes: [porridge], loading: false });
  });

  it('UPSERT adds a new recipe', () => {
    const state = recipeReducer({ recipes: [porridge], loading: false }, { type: 'UPSERT', recipe: soup });
    expect(state.recipes).toEqual([porridge, soup]);
  });

  it('UPSERT replaces an existing recipe by id rather than duplicating', () => {
    const updated = { ...porridge, name: 'Porridge v2' };
    const state = recipeReducer({ recipes: [porridge, soup], loading: false }, { type: 'UPSERT', recipe: updated });
    expect(state.recipes).toEqual([updated, soup]);
  });

  it('REMOVE deletes only the targeted recipe', () => {
    const state = recipeReducer({ recipes: [porridge, soup], loading: false }, { type: 'REMOVE', id: porridge.id });
    expect(state.recipes).toEqual([soup]);
  });
});

function fakeRepository(initial: Recipe[]): RecipeRepository & { saved: Recipe[]; deleted: string[] } {
  const saved: Recipe[] = [];
  const deleted: string[] = [];
  return {
    saved,
    deleted,
    async getAll() {
      return initial;
    },
    async save(recipe: Recipe) {
      saved.push(recipe);
    },
    async delete(id: string) {
      deleted.push(id);
    },
  };
}

describe('RecipeProvider', () => {
  it('loads recipes from the repository on mount', async () => {
    const repo = fakeRepository([porridge]);
    let tree: renderer.ReactTestRenderer;
    function Consumer() {
      const { recipes, loading } = useRecipes();
      return <Text>{loading ? 'loading' : recipes.map((r) => r.name).join(',')}</Text>;
    }
    await act(async () => {
      tree = renderer.create(
        <RecipeProvider repository={repo}>
          <Consumer />
        </RecipeProvider>,
      );
    });
    expect(tree!.root.findByType(Text).props.children).toBe('Porridge');
  });

  it('addOrUpdateRecipe calls repository.save and updates state', async () => {
    const repo = fakeRepository([]);
    let hookResult: ReturnType<typeof useRecipes>;
    function Consumer() {
      hookResult = useRecipes();
      return null;
    }
    await act(async () => {
      renderer.create(
        <RecipeProvider repository={repo}>
          <Consumer />
        </RecipeProvider>,
      );
    });
    await act(async () => {
      await hookResult!.addOrUpdateRecipe(porridge);
    });
    expect(repo.saved).toEqual([porridge]);
    expect(hookResult!.recipes).toEqual([porridge]);
  });

  it('deleteRecipe calls repository.delete and updates state', async () => {
    const repo = fakeRepository([porridge]);
    let hookResult: ReturnType<typeof useRecipes>;
    function Consumer() {
      hookResult = useRecipes();
      return null;
    }
    await act(async () => {
      renderer.create(
        <RecipeProvider repository={repo}>
          <Consumer />
        </RecipeProvider>,
      );
    });
    await act(async () => {
      await hookResult!.deleteRecipe(porridge.id);
    });
    expect(repo.deleted).toEqual([porridge.id]);
    expect(hookResult!.recipes).toEqual([]);
  });
});
