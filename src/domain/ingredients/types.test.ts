import { oats, onion } from '../testing/fixtures';

describe('fixtures', () => {
  it('oats have a volume portion usable for conversion', () => {
    const volumePortion = oats.portions.find((p) => p.unit.kind === 'volume');
    expect(volumePortion).toBeDefined();
    expect(volumePortion!.gramsPerUnit).toBe(80);
  });

  it('onion has a count portion labelled medium', () => {
    const countPortion = onion.portions.find(
      (p) => p.unit.kind === 'count' && p.unit.label === 'medium',
    );
    expect(countPortion).toBeDefined();
    expect(countPortion!.gramsPerUnit).toBe(110);
  });

  it('nutrition is expressed per 100 g', () => {
    expect(oats.nutritionPer100g.kcal).toBe(389);
  });
});
