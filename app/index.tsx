import { StyleSheet, Text, View } from 'react-native';

export default function RecipesRoute() {
  return (
    <View style={styles.container}>
      <Text>Recipes</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
