import { ok, err, type Result } from './result';

describe('Result', () => {
  it('wraps a success value', () => {
    const r: Result<number> = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('wraps an error', () => {
    const r: Result<number> = err({ code: 'INVALID_AMOUNT', amount: -1 });
    expect(r).toEqual({ ok: false, error: { code: 'INVALID_AMOUNT', amount: -1 } });
  });

  it('narrows the type when ok is checked', () => {
    const r: Result<number> = ok(10);
    if (r.ok) {
      expect(r.value + 1).toBe(11);
    } else {
      throw new Error('expected ok');
    }
  });
});
