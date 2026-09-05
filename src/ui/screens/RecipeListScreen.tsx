import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecipes } from '../context/RecipeContext';

export function RecipeListScreen() {
  const { recipes, loading } = useRecipes();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {recipes.length === 0 ? (
        <View style={styles.centered}>
          <Text>No recipes yet — add your first one.</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/recipes/${item.id}`)}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>{item.servings} servings</Text>
            </Pressable>
          )}
        />
      )}
      <Link href="/recipes/new" style={[styles.addButton, { paddingBottom: 16 + insets.bottom }]}>
        <Text style={styles.addButtonText}>+ New recipe</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, color: '#666' },
  addButton: { padding: 16, alignItems: 'center' },
  addButtonText: { fontSize: 16, fontWeight: '600' },
});
