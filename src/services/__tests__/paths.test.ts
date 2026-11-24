import {
  comicRootFromPagesDir,
  comicSandboxDir,
  comicsRoot,
  isSafeComicDeleteRoot,
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

describe('isSafeComicDeleteRoot / comicSandboxDir', () => {
  const sandbox = 'file:///data/Containers/Data/Application/NEW-UUID/Documents/comics/';

  it('allows only a single comic folder under comics/', () => {
    expect(isSafeComicDeleteRoot(`${sandbox}c_abc/`)).toBe(true);
    expect(isSafeComicDeleteRoot(`${sandbox}c_abc`)).toBe(true);
  });

  it('rejects the sandbox root, nested paths, and outside paths', () => {
    expect(isSafeComicDeleteRoot(sandbox)).toBe(false);
    expect(isSafeComicDeleteRoot(`${sandbox}c_abc/pages/`)).toBe(false);
    expect(isSafeComicDeleteRoot(`${sandbox}../Documents/`)).toBe(false);
    expect(isSafeComicDeleteRoot('file:///tmp/evil/')).toBe(false);
  });

  it('builds a guarded sandbox dir from comic id', () => {
    expect(comicSandboxDir('c_abc')).toBe(`${sandbox}c_abc/`);
  });

  it('rejects unsafe comic ids', () => {
    expect(() => comicSandboxDir('../evil')).toThrow(/Invalid comic id/);
    expect(() => comicSandboxDir('a/b')).toThrow(/Invalid comic id/);
  });
});
