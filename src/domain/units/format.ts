export function formatGrams(grams: number): string {
  if (grams >= 1000) {
    const kg = parseFloat((grams / 1000).toFixed(1));
    return `${kg} kg`;
  }
  return `${Math.round(grams)} g`;
}
