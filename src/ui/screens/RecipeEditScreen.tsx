import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDraftRecipe } from '../context/DraftRecipeContext';
import { useRecipes } from '../context/RecipeContext';

export function RecipeEditScreen() {
  const router = useRouter();
  const { draft, setName, setServings, setSteps, removeIngredientLine, buildRecipe } = useDraftRecipe();
  const { addOrUpdateRecipe } = useRecipes();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={draft.name} onChangeText={setName} placeholder="Recipe name" />

      <Text style={styles.label}>Servings</Text>
      <TextInput
        style={styles.input}
        value={String(draft.servings)}
        onChangeText={(text) => setServings(Number(text) || 1)}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Steps (one per line)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={draft.steps.join('\n')}
        onChangeText={(text) => setSteps(text.split('\n'))}
        multiline
      />

      <Text style={styles.label}>Ingredients</Text>
      {draft.ingredientLines.map((line) => (
        <View key={line.ingredientId} style={styles.ingredientRow}>
          <Text>{line.quantity.input.amount} — {line.ingredientName}</Text>
          <Pressable onPress={() => removeIngredientLine(line.ingredientId)}>
            <Text>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.addIngredientButton} onPress={() => router.push('/add-ingredient')}>
        <Text>Add ingredient</Text>
      </Pressable>

      <Pressable
        style={styles.saveButton}
        onPress={async () => {
          await addOrUpdateRecipe(buildRecipe());
          router.back();
        }}
      >
        <Text>Save</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, marginTop: 4 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  addIngredientButton: { marginTop: 8, padding: 12, alignItems: 'center' },
  saveButton: { marginTop: 24, padding: 12, alignItems: 'center' },
});
