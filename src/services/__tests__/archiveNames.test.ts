import {
  archiveBasename,
  archiveNameKey,
  isComicArchiveName,
  normalizeArchiveName,
  safeDecodeURIComponent,
} from '@/services/archiveNames';

describe('safeDecodeURIComponent', () => {
  it('decodes valid escapes', () => {
    expect(safeDecodeURIComponent('Batman%20%2301.cbz')).toBe('Batman #01.cbz');
  });

  it('returns the original string when % is malformed', () => {
    expect(safeDecodeURIComponent('broken%zz.cbz')).toBe('broken%zz.cbz');
    expect(safeDecodeURIComponent('ends-with%')).toBe('ends-with%');
  });
});

describe('normalizeArchiveName', () => {
  it('trims and lowercases', () => {
    expect(normalizeArchiveName('  Batman #01.CBZ  ')).toBe('batman #01.cbz');
  });
});

describe('archiveBasename / archiveNameKey', () => {
  it('takes the last path segment from file URIs', () => {
    expect(archiveBasename('file:///storage/comics/Batman%20%2301.cbz')).toBe('Batman #01.cbz');
    expect(archiveNameKey('file:///storage/comics/Batman%20%2301.CBZ')).toBe('batman #01.cbz');
  });

  it('survives malformed URI encoding', () => {
    expect(archiveBasename('content://tree/primary%3AComics/broken%name.cbz')).toBe(
      'broken%name.cbz',
    );
    expect(archiveNameKey('content://tree/primary%3AComics/broken%name.CBZ')).toBe(
      'broken%name.cbz',
    );
  });
});

describe('isComicArchiveName', () => {
  it('accepts cbz and zip', () => {
    expect(isComicArchiveName('Batman.CBZ')).toBe(true);
    expect(isComicArchiveName('issue.zip')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isComicArchiveName('issue.cbr')).toBe(false);
    expect(isComicArchiveName('notes.txt')).toBe(false);
  });
});
