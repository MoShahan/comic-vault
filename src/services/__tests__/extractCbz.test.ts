import { CancelledError, isCancelledError, isLikelyOutOfMemoryMessage } from '@/services/extractCbz';

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

describe('isLikelyOutOfMemoryMessage', () => {
  it('matches real OOM phrasing', () => {
    expect(isLikelyOutOfMemoryMessage('Java OutOfMemoryError')).toBe(true);
    expect(isLikelyOutOfMemoryMessage('OOM when allocating')).toBe(true);
    expect(isLikelyOutOfMemoryMessage('out of memory')).toBe(true);
    expect(isLikelyOutOfMemoryMessage('cannot allocate memory')).toBe(true);
  });

  it('does not match room/zoom or generic text', () => {
    expect(isLikelyOutOfMemoryMessage('no room left on device')).toBe(false);
    expect(isLikelyOutOfMemoryMessage('zoom failed')).toBe(false);
    expect(isLikelyOutOfMemoryMessage('failed to allocate page buffer')).toBe(false);
  });
});
