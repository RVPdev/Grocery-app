export type GroceryLine = {
  ingredientId: string;
  name: string;
  totalGrams: number;
  display: string;
};

export type GroceryList = {
  lines: GroceryLine[];
};
