import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useIngredients } from '../context/IngredientContext';
import { useDraftRecipe } from '../context/DraftRecipeContext';
import { toGrams } from '../../domain/units/convert';
import type { Ingredient } from '../../domain/ingredients/types';
import type { MassSymbol, Unit, VolumeSymbol } from '../../domain/units/types';

type Step = 'search' | 'custom-create' | 'amount' | 'learn-portion';

const MASS_UNITS: MassSymbol[] = ['g', 'kg', 'oz', 'lb'];
const ALL_VOLUME_UNITS: VolumeSymbol[] = ['ml', 'l', 'tsp', 'tbsp', 'cup', 'floz'];

function availableUnits(ingredient: Ingredient): Unit[] {
  const units: Unit[] = MASS_UNITS.map((symbol) => ({ kind: 'mass', symbol }));
  for (const portion of ingredient.portions) {
    if (portion.unit.kind === 'volume' && !units.some((u) => u.kind === 'volume')) {
      units.push(...ALL_VOLUME_UNITS.map((symbol) => ({ kind: 'volume', symbol }) as Unit));
    }
    if (portion.unit.kind === 'count') {
      units.push(portion.unit);
    }
  }
  return units;
}

function unitLabel(unit: Unit): string {
  return unit.kind === 'count' ? unit.label : unit.symbol;
}

export function AddIngredientScreen() {
  const router = useRouter();
  const { search, addUserIngredient, learnPortion } = useIngredients();
  const { addIngredientLine } = useDraftRecipe();

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Ingredient[]>([]);
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [showAllUnits, setShowAllUnits] = useState(false);
  const [chosenUnit, setChosenUnit] = useState<Unit | null>(null);
  const [amountText, setAmountText] = useState('');
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [gramsPerUnitText, setGramsPerUnitText] = useState('');

  async function runSearch(text: string) {
    setQuery(text);
    setResults(text.trim().length === 0 ? [] : await search(text));
  }

  function pickIngredient(ingredient: Ingredient) {
    setSelected(ingredient);
    setChosenUnit(null);
    setShowAllUnits(false);
    setStep('amount');
  }

  function tryConvert(unit: Unit, amount: number) {
    if (!selected) return;
    const result = toGrams(amount, unit, selected);
    if (result.ok) {
      addIngredientLine({
        ingredientId: selected.id,
        ingredientName: selected.name,
        quantity: { grams: result.value, input: { amount, unit } },
      });
      router.back();
      return;
    }
    if (result.error.code === 'NO_PORTION_DATA') {
      setConversionError(null);
      setStep('learn-portion');
      return;
    }
    setConversionError('Enter a positive amount.');
  }

  return (
    <ScrollView style={styles.container}>
      {step === 'search' && (
        <View>
          <TextInput style={styles.input} placeholder="Search ingredients" value={query} onChangeText={runSearch} />
          {results.map((ingredient) => (
            <Pressable key={ingredient.id} style={styles.row} onPress={() => pickIngredient(ingredient)}>
              <Text>{ingredient.name}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.row} onPress={() => setStep('custom-create')}>
            <Text>Can&apos;t find it? Add a custom ingredient</Text>
          </Pressable>
        </View>
      )}

      {step === 'custom-create' && (
        <CustomIngredientForm
          onCreated={async (ingredient) => {
            await addUserIngredient(ingredient);
            pickIngredient(ingredient);
          }}
        />
      )}

      {step === 'amount' && selected && (
        <View>
          <Text style={styles.label}>{selected.name}</Text>
          <Text style={styles.label}>Unit</Text>
          {(showAllUnits
            ? [...MASS_UNITS.map((s) => ({ kind: 'mass', symbol: s }) as Unit), ...ALL_VOLUME_UNITS.map((s) => ({ kind: 'volume', symbol: s }) as Unit)]
            : availableUnits(selected)
          ).map((unit) => (
            <Pressable key={unitLabel(unit)} style={styles.row} onPress={() => setChosenUnit(unit)}>
              <Text>{unitLabel(unit)}</Text>
            </Pressable>
          ))}
          {!showAllUnits && (
            <Pressable style={styles.row} onPress={() => setShowAllUnits(true)}>
              <Text>Use a different unit</Text>
            </Pressable>
          )}
          {chosenUnit && (
            <View>
              <Text style={styles.label}>Amount ({unitLabel(chosenUnit)})</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={amountText} onChangeText={setAmountText} />
              {conversionError && <Text style={styles.error}>{conversionError}</Text>}
              <Pressable
                style={styles.row}
                onPress={() => {
                  const amount = Number(amountText);
                  if (!Number.isFinite(amount) || amount <= 0) {
                    setConversionError('Enter a positive amount.');
                    return;
                  }
                  tryConvert(chosenUnit, amount);
                }}
              >
                <Text>Add to recipe</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {step === 'learn-portion' && selected && chosenUnit && (
        <View>
          <Text style={styles.label}>
            How many grams is 1 {unitLabel(chosenUnit)} of {selected.name}?
          </Text>
          <TextInput style={styles.input} keyboardType="numeric" value={gramsPerUnitText} onChangeText={setGramsPerUnitText} />
          <Pressable
            style={styles.row}
            onPress={async () => {
              const gramsPerUnit = Number(gramsPerUnitText);
              if (!Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0) return;
              await learnPortion(selected.id, {
                label: unitLabel(chosenUnit),
                unit: chosenUnit,
                gramsPerUnit,
              });
              setStep('amount');
            }}
          >
            <Text>Save and continue</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function CustomIngredientForm({ onCreated }: { onCreated: (ingredient: Ingredient) => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');

  return (
    <View>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      <Text style={styles.label}>Per 100g — kcal / protein / carbs / fat</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={kcal} onChangeText={setKcal} placeholder="kcal" />
      <TextInput style={styles.input} keyboardType="numeric" value={proteinG} onChangeText={setProteinG} placeholder="protein (g)" />
      <TextInput style={styles.input} keyboardType="numeric" value={carbsG} onChangeText={setCarbsG} placeholder="carbs (g)" />
      <TextInput style={styles.input} keyboardType="numeric" value={fatG} onChangeText={setFatG} placeholder="fat (g)" />
      <Pressable
        style={styles.row}
        onPress={() => {
          onCreated({
            id: `user:${randomUUID()}`,
            name,
            nutritionPer100g: {
              kcal: Number(kcal) || 0,
              proteinG: Number(proteinG) || 0,
              carbsG: Number(carbsG) || 0,
              fatG: Number(fatG) || 0,
            },
            portions: [],
            source: 'user',
          });
        }}
      >
        <Text>Create ingredient</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', padding: 8, marginTop: 4 },
  row: { paddingVertical: 10 },
  error: { color: 'red' },
});
