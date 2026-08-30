import { formatGrams } from './format';

describe('formatGrams', () => {
  it('shows small amounts in grams', () => {
    expect(formatGrams(500)).toBe('500 g');
  });

  it('rounds grams to whole numbers', () => {
    expect(formatGrams(499.6)).toBe('500 g');
  });

  it('switches to kilograms at 1000 g', () => {
    expect(formatGrams(1840)).toBe('1.8 kg');
  });

  it('drops a trailing zero decimal', () => {
    expect(formatGrams(1000)).toBe('1 kg');
  });
});
