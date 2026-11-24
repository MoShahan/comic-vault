import {
  comicRootFromPagesDir,
  comicsRoot,
  resolveComicPath,
  toStoredComicPath,
} from '@/services/paths';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/Containers/Data/Application/NEW-UUID/Documents/',
}));

describe('toStoredComicPath', () => {
  it('strips down to id-relative under /comics/', () => {
    expect(
      toStoredComicPath(
        'file:///data/Containers/Data/Application/OLD-UUID/Documents/comics/c_abc/pages/',
      ),
    ).toBe('c_abc/pages/');
    expect(
      toStoredComicPath(
        'file:///data/Containers/Data/Application/OLD-UUID/Documents/comics/c_abc/pages/page_0001.jpg',
      ),
    ).toBe('c_abc/pages/page_0001.jpg');
  });

  it('leaves already-relative paths alone', () => {
    expect(toStoredComicPath('c_abc/pages/')).toBe('c_abc/pages/');
    expect(toStoredComicPath('/c_abc/pages/page_0001.jpg')).toBe('c_abc/pages/page_0001.jpg');
  });
});

describe('resolveComicPath', () => {
  it('rebases legacy absolute paths onto the current documentDirectory', () => {
    expect(
      resolveComicPath(
        'file:///data/Containers/Data/Application/OLD-UUID/Documents/comics/c_abc/pages/',
      ),
    ).toBe('file:///data/Containers/Data/Application/NEW-UUID/Documents/comics/c_abc/pages/');
  });

  it('resolves relative storage keys', () => {
    expect(resolveComicPath('c_abc/pages/page_0001.jpg')).toBe(
      'file:///data/Containers/Data/Application/NEW-UUID/Documents/comics/c_abc/pages/page_0001.jpg',
    );
  });
});

describe('comicsRoot / comicRootFromPagesDir', () => {
  it('returns the comics root under documentDirectory', () => {
    expect(comicsRoot()).toBe(
      'file:///data/Containers/Data/Application/NEW-UUID/Documents/comics/',
    );
  });

  it('strips the pages segment', () => {
    expect(
      comicRootFromPagesDir(
        'file:///data/Containers/Data/Application/NEW-UUID/Documents/comics/c_abc/pages/',
      ),
    ).toBe('file:///data/Containers/Data/Application/NEW-UUID/Documents/comics/c_abc/');
  });
});
