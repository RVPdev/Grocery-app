import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePlan } from '../context/PlanContext';
import { useRecipes } from '../context/RecipeContext';
import { useIngredients } from '../context/IngredientContext';
import { resolveIngredientsForRecipes } from './resolveIngredientsForRecipes';
import { scaleRecipe } from '../../domain/recipes/scale';
import { calculateMacros } from '../../domain/recipes/macros';
import type { Ingredient } from '../../domain/ingredients/types';
import type { Recipe } from '../../domain/recipes/types';

export function PlanScreen() {
  const { plan, loading: planLoading, addMeal, removeMeal, updateMealServings } = usePlan();
  const { recipes, loading: recipesLoading } = useRecipes();
  const { resolve } = useIngredients();
  const [ingredientMap, setIngredientMap] = useState<Map<string, Ingredient> | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickedRecipe, setPickedRecipe] = useState<Recipe | null>(null);
  const [servingsText, setServingsText] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  function cancelAdding() {
    setAdding(false);
    setPickedRecipe(null);
    setServingsText('');
    setAddError(null);
  }

  useEffect(() => {
    const plannedRecipes = plan.meals
      .map((meal) => recipes.find((r) => r.id === meal.recipeId))
      .filter((r): r is Recipe => r !== undefined);
    let cancelled = false;
    resolveIngredientsForRecipes(resolve, plannedRecipes).then((map) => {
      if (!cancelled) setIngredientMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [plan, recipes]);

  if (planLoading || recipesLoading || !ingredientMap) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const plannedRecipeIds = new Set(plan.meals.map((m) => m.recipeId));
  const availableToAdd = recipes.filter((r) => !plannedRecipeIds.has(r.id));

  return (
    <ScrollView style={styles.container}>
      {plan.meals.length === 0 && <Text>No meals planned yet.</Text>}

      {plan.meals.map((meal) => {
        const recipe = recipes.find((r) => r.id === meal.recipeId);
        if (!recipe) {
          return (
            <View key={meal.recipeId} style={styles.row}>
              <Text>Recipe was deleted.</Text>
              <Pressable onPress={() => removeMeal(meal.recipeId)}>
                <Text style={styles.link}>Remove from plan</Text>
              </Pressable>
            </View>
          );
        }

        const scaled = scaleRecipe(recipe, meal.servings);
        const macros = scaled.ok ? calculateMacros(scaled.value, ingredientMap) : scaled;

        return (
          <View key={meal.recipeId} style={styles.row}>
            <Text style={styles.rowTitle}>{recipe.name}</Text>
            <View style={styles.servingsRow}>
              <TextInput
                style={styles.servingsInput}
                keyboardType="numeric"
                defaultValue={String(meal.servings)}
                onEndEditing={(e) => {
                  const parsed = Number(e.nativeEvent.text);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    updateMealServings(meal.recipeId, parsed);
                  }
                }}
              />
              <Text>servings</Text>
            </View>
            {macros.ok ? (
              <Text style={styles.macros}>
                {Math.round(macros.value.total.kcal)} kcal, {Math.round(macros.value.total.proteinG)}g protein,{' '}
                {Math.round(macros.value.total.carbsG)}g carbs, {Math.round(macros.value.total.fatG)}g fat
              </Text>
            ) : (
              <Text style={styles.macros}>Macros unavailable.</Text>
            )}
            <Pressable onPress={() => removeMeal(meal.recipeId)}>
              <Text style={styles.link}>Remove</Text>
            </Pressable>
          </View>
        );
      })}

      {!adding && (
        <Pressable style={styles.addButton} onPress={() => setAdding(true)}>
          <Text>+ Add recipe to plan</Text>
        </Pressable>
      )}

      {adding && !pickedRecipe && (
        <View>
          <Text style={styles.sectionHeading}>Pick a recipe</Text>
          {availableToAdd.length === 0 && <Text>No recipes yet — create one on the Recipes tab.</Text>}
          {availableToAdd.map((recipe) => (
            <Pressable key={recipe.id} style={styles.row} onPress={() => setPickedRecipe(recipe)}>
              <Text>{recipe.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={cancelAdding}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {adding && pickedRecipe && (
        <View>
          <Text style={styles.sectionHeading}>Servings of {pickedRecipe.name}</Text>
          <TextInput
            style={styles.servingsInput}
            keyboardType="numeric"
            value={servingsText}
            onChangeText={setServingsText}
            placeholder={String(pickedRecipe.servings)}
          />
          {addError && <Text style={styles.error}>{addError}</Text>}
          <Pressable
            style={styles.addButton}
            onPress={async () => {
              const parsed = Number(servingsText);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                setAddError('Enter a number of servings greater than 0.');
                return;
              }
              await addMeal({ recipeId: pickedRecipe.id, servings: parsed });
              cancelAdding();
            }}
          >
            <Text>Add to plan</Text>
          </Pressable>
          <Pressable onPress={cancelAdding}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  servingsInput: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, width: 60 },
  macros: { color: '#666', marginTop: 4 },
  link: { color: '#0066cc', marginTop: 4 },
  addButton: { padding: 16, alignItems: 'center' },
  sectionHeading: { marginTop: 16, fontSize: 16, fontWeight: '600' },
  error: { color: '#cc0000', marginTop: 4 },
});
