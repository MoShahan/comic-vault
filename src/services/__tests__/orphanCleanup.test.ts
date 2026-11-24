import { orphanFolderNames } from '@/services/orphanCleanup';

describe('orphanFolderNames', () => {
  it('returns disk folders that are not library ids', () => {
    expect(orphanFolderNames(['c_keep', 'c_orphan', 'c_other'], new Set(['c_keep', 'c_other']))).toEqual([
      'c_orphan',
    ]);
  });

  it('returns an empty list when everything matches', () => {
    expect(orphanFolderNames(['c_a'], new Set(['c_a']))).toEqual([]);
  });

  it('ignores empty names', () => {
    expect(orphanFolderNames(['', 'c_orphan'], new Set())).toEqual(['c_orphan']);
  });
});
