import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRecipes } from '../context/RecipeContext';
import { useIngredients } from '../context/IngredientContext';
import { calculateMacros } from '../../domain/recipes/macros';
import { scaleRecipe } from '../../domain/recipes/scale';
import { formatGrams } from '../../domain/units/format';
import type { Ingredient } from '../../domain/ingredients/types';
import type { Recipe } from '../../domain/recipes/types';

export function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { recipes, deleteRecipe, addOrUpdateRecipe } = useRecipes();
  const { resolve } = useIngredients();
  const recipe = recipes.find((r) => r.id === id);
  const [ingredientMap, setIngredientMap] = useState<Map<string, Ingredient> | null>(null);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [scaleTo, setScaleTo] = useState<string>('');

  useEffect(() => {
    if (!recipe) return;
    let cancelled = false;
    (async () => {
      const map = new Map<string, Ingredient>();
      const missing: string[] = [];
      for (const item of recipe.ingredients) {
        const resolved = await resolve(item.ingredientId);
        if (resolved) map.set(item.ingredientId, resolved);
        else missing.push(item.ingredientId);
      }
      if (!cancelled) {
        setIngredientMap(map);
        setMissingIds(missing);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipe?.id, recipe?.ingredients]);

  if (!recipe) {
    return (
      <View style={styles.centered}>
        <Text>Recipe not found.</Text>
      </View>
    );
  }

  if (!ingredientMap) {
    return (
      <>
        <Stack.Screen options={{ title: recipe.name }} />
        <View style={styles.centered}>
          <Text>Loading…</Text>
        </View>
      </>
    );
  }

  const macros = calculateMacros(recipe, ingredientMap);
  const parsedScaleTo = Number(scaleTo);
  const scaled: Recipe | null =
    scaleTo !== '' && Number.isFinite(parsedScaleTo) && parsedScaleTo > 0
      ? (() => {
          const result = scaleRecipe(recipe, parsedScaleTo);
          return result.ok ? result.value : null;
        })()
      : recipe;

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: recipe.name }} />
      <Text style={styles.title}>{recipe.name}</Text>
      <Text>{recipe.servings} servings</Text>

      {macros.ok ? (
        <Text style={styles.macros}>
          Per serving: {Math.round(macros.value.perServing.kcal)} kcal, {Math.round(macros.value.perServing.proteinG)}g
          protein, {Math.round(macros.value.perServing.carbsG)}g carbs, {Math.round(macros.value.perServing.fatG)}g fat
        </Text>
      ) : (
        <Text style={styles.macros}>Macros unavailable until every ingredient below is resolved.</Text>
      )}

      <Text style={styles.sectionHeading}>Scale to</Text>
      <TextInput
        style={styles.input}
        value={scaleTo}
        onChangeText={setScaleTo}
        keyboardType="numeric"
        placeholder={`${recipe.servings}`}
      />

      <Text style={styles.sectionHeading}>Ingredients</Text>
      {scaled?.ingredients.map((item) => {
        const ingredient = ingredientMap.get(item.ingredientId);
        return (
          <Text key={item.ingredientId}>
            {item.quantity.input.amount.toFixed(1)} {'symbol' in item.quantity.input.unit ? item.quantity.input.unit.symbol : item.quantity.input.unit.label}
            {' '}
            {ingredient?.name ?? item.ingredientId} ({formatGrams(item.quantity.grams)})
          </Text>
        );
      })}
      {missingIds.map((missingId) => (
        <View key={missingId} style={styles.missingRow}>
          <Text>An ingredient was removed from this recipe's library.</Text>
          <Pressable
            onPress={async () => {
              const updated = { ...recipe, ingredients: recipe.ingredients.filter((i) => i.ingredientId !== missingId) };
              await addOrUpdateRecipe(updated);
            }}
          >
            <Text>Remove from recipe</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionHeading}>Steps</Text>
      {recipe.steps.map((step, i) => (
        <Text key={i}>{i + 1}. {step}</Text>
      ))}

      <Pressable style={styles.editButton} onPress={() => router.push(`/${recipe.id}/edit`)}>
        <Text>Edit</Text>
      </Pressable>
      <Pressable
        style={styles.deleteButton}
        onPress={async () => {
          await deleteRecipe(recipe.id);
          router.back();
        }}
      >
        <Text>Delete</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  macros: { marginVertical: 8 },
  sectionHeading: { marginTop: 16, fontSize: 16, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, marginVertical: 4 },
  missingRow: { marginVertical: 4 },
  editButton: { marginTop: 24, padding: 12, alignItems: 'center' },
  deleteButton: { padding: 12, alignItems: 'center' },
});
