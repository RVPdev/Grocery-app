import { detectUnitFromText } from './detectUnit';

describe('detectUnitFromText', () => {
  it('detects a volume unit', () => {
    expect(detectUnitFromText('1 cup')).toEqual({ kind: 'volume', symbol: 'cup' });
  });

  it('detects tablespoon by its abbreviation', () => {
    expect(detectUnitFromText('2 tbsp')).toEqual({ kind: 'volume', symbol: 'tbsp' });
  });

  it('detects a mass unit', () => {
    expect(detectUnitFromText('3 oz')).toEqual({ kind: 'mass', symbol: 'oz' });
  });

  it('does not mistake "fl oz" (volume) for "oz" (mass)', () => {
    expect(detectUnitFromText('1 fl oz')).toEqual({ kind: 'volume', symbol: 'floz' });
  });

  it('falls back to a count label for descriptive text', () => {
    expect(detectUnitFromText('1 medium')).toEqual({ kind: 'count', label: '1 medium' });
  });

  it('returns null for empty text', () => {
    expect(detectUnitFromText('')).toBeNull();
    expect(detectUnitFromText('   ')).toBeNull();
  });

  it('does not claim "bag (7 oz)" as mass just because "oz" appears in a parenthetical', () => {
    expect(detectUnitFromText('bag (7 oz)')).toEqual({ kind: 'count', label: 'bag (7 oz)' });
  });

  it('does not claim "bar (1 oz)" as mass', () => {
    expect(detectUnitFromText('bar (1 oz)')).toEqual({ kind: 'count', label: 'bar (1 oz)' });
  });

  it('does not claim "packet (.75 oz)" as mass', () => {
    expect(detectUnitFromText('packet (.75 oz)')).toEqual({ kind: 'count', label: 'packet (.75 oz)' });
  });

  it('does not claim a yield parenthetical mentioning grams as mass', () => {
    expect(detectUnitFromText('steak (yield from 186 g raw meat)')).toEqual({
      kind: 'count',
      label: 'steak (yield from 186 g raw meat)',
    });
  });

  it('does not claim a yield parenthetical mentioning pounds as mass, and stops the leading segment at the first comma', () => {
    expect(
      detectUnitFromText('piece, cooked (yield from 1 lb unheated table spread)'),
    ).toEqual({
      kind: 'count',
      label: 'piece, cooked (yield from 1 lb unheated table spread)',
    });
  });
});
