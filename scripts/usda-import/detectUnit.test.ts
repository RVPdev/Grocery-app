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
});
