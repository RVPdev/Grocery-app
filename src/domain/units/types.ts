export type MassSymbol = 'g' | 'kg' | 'oz' | 'lb';
export type VolumeSymbol = 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz';

export type Unit =
  | { kind: 'mass'; symbol: MassSymbol }
  | { kind: 'volume'; symbol: VolumeSymbol }
  | { kind: 'count'; label: string };

export type Quantity = {
  grams: number;
  input: { amount: number; unit: Unit };
};
