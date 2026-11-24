import { CancelledError, isCancelledError } from '@/services/extractCbz';

describe('isCancelledError', () => {
  it('detects CancelledError instances', () => {
    expect(isCancelledError(new CancelledError())).toBe(true);
    expect(isCancelledError(new CancelledError('stopped'))).toBe(true);
  });

  it('detects errors named CancelledError (cross-realm / rethrown)', () => {
    const err = new Error('Import cancelled');
    err.name = 'CancelledError';
    expect(isCancelledError(err)).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isCancelledError(new Error('boom'))).toBe(false);
    expect(isCancelledError(null)).toBe(false);
    expect(isCancelledError('cancelled')).toBe(false);
  });
});
