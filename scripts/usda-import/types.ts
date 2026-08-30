export type FoodRow = {
  fdc_id: string;
  description: string;
  data_type: string;
};

export type NutrientRow = {
  id: string;
  name: string;
  unit_name: string;
  nutrient_nbr: string;
};

export type FoodNutrientRow = {
  fdc_id: string;
  nutrient_id: string;
  amount: string;
};

export type FoodPortionRow = {
  fdc_id: string;
  amount: string;
  // Always "9999" ("undetermined") for SR Legacy — real unit information
  // lives only in modifier/portion_description. Kept here because it's a
  // real column in the source file, even though this plan's code never
  // reads it.
  measure_unit_id: string;
  portion_description: string;
  modifier: string;
  gram_weight: string;
};
