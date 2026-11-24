import { Platform } from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';

import {
  findComicBySourceFileName,
  getImportedArchiveNameKeys,
  insertComic,
} from '@/db/comicRepository';
import {
  archiveBasename,
  archiveNameKey,
  isComicArchiveName,
} from '@/services/archiveNames';
import { CancelledError, extractCbzToDirectory, isCancelledError } from '@/services/extractCbz';
import { guessSeries, titleFromFilename } from '@/services/naturalSort';
import { comicSandboxDir } from '@/services/paths';

import type { Comic, ImportProgress } from '@/types/comic';

type ImportSource = {
  uri: string;
  name: string;
};

function makeId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type ImportOptions = {
  onProgress?: (progress: ImportProgress) => void;
  onComicImported?: (comic: Comic) => void;
  isCancelled?: () => boolean;
};

export type ImportFailure = {
  fileName: string;
  reason: string;
};

export type FolderImportResult = {
  comics: Comic[];
  failures: ImportFailure[];
  skippedDuplicates: number;
  summaryMessage: string;
};

class DuplicateComicError extends Error {
  constructor(fileName: string) {
    super(`Already imported (same filename): ${fileName}`);
    this.name = 'DuplicateComicError';
  }
}

function errorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'Unknown error';
}

function buildImportSummary(
  imported: number,
  skipped: number,
  failures: ImportFailure[],
): string {
  const parts: string[] = [];
  if (imported > 0) {
    parts.push(`Added ${imported}`);
  }
  if (skipped > 0) {
    parts.push(`skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}`);
  }
  if (failures.length > 0) {
    parts.push(`${failures.length} failed`);
  }

  if (parts.length === 0) {
    return 'No comics were added.';
  }

  let message = `${parts.join(', ')}.`;
  if (failures.length > 0) {
    const shown = failures.slice(0, 3);
    const detail = shown.map((f) => `• ${f.fileName}: ${f.reason}`).join('\n');
    const extra =
      failures.length > 3 ? `\n…and ${failures.length - 3} more` : '';
    message = `${message}\n\n${detail}${extra}`;
  }
  return message;
}

async function importSingleSource(source: ImportSource, options: ImportOptions): Promise<Comic> {
  const name = source.name || 'comic.cbz';
  const lower = name.toLowerCase();
  if (lower.endsWith('.cbr')) {
    throw new Error(
      'CBR is not supported yet. Convert to CBZ on your computer (7-Zip/WinRAR: extract then zip), then add the CBZ to your comics folder.',
    );
  }
  if (!isComicArchiveName(name)) {
    throw new Error('Only CBZ or ZIP comic files are supported.');
  }

  const existing = await findComicBySourceFileName(name);
  if (existing) {
    throw new DuplicateComicError(name);
  }

  const id = makeId();
  const comicDir = comicSandboxDir(id);
  const pagesDir = `${comicDir}pages/`;
  const archivePath = `${comicDir}source.cbz`;

  const report = (progress: ImportProgress) => options.onProgress?.(progress);

  try {
    await FileSystem.makeDirectoryAsync(comicDir, { intermediates: true });

    report({
      phase: 'copying',
      current: 0,
      total: 1,
      message: `Copying ${name}…`,
    });
    await FileSystem.copyAsync({ from: source.uri, to: archivePath });
    if (options.isCancelled?.()) throw new CancelledError();

    report({
      phase: 'extracting',
      current: 0,
      total: 1,
      message: `Extracting ${name}…`,
    });
    const pages = await extractCbzToDirectory(archivePath, pagesDir, {
      onProgress: (current, total) =>
        report({
          phase: 'extracting',
          current,
          total: total || current,
          message:
            total > 0 ? `Extracting page ${current} of ${total}…` : `Extracting page ${current}…`,
        }),
      isCancelled: options.isCancelled,
    });

    report({
      phase: 'saving',
      current: 1,
      total: 1,
      message: 'Saving to library…',
    });
    const title = titleFromFilename(name);
    const comic: Comic = {
      id,
      title,
      series: guessSeries(title),
      sourceUri: source.uri,
      sourceFileName: name,
      coverPath: pages[0],
      pagesDir,
      pageCount: pages.length,
      currentPage: 0,
      spreadHalf: 'full',
      isRead: false,
      isFavorite: false,
      fitMode: 'screen',
      readingDirection: 'ltr',
      lastReadAt: null,
      importedAt: Date.now(),
    };
    await insertComic(comic);

    report({ phase: 'done', current: 1, total: 1, message: 'Added' });
    return comic;
  } catch (error) {
    await FileSystem.deleteAsync(comicDir, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

async function importSources(
  sources: ImportSource[],
  options: ImportOptions,
): Promise<FolderImportResult> {
  const imported: Comic[] = [];
  const failures: ImportFailure[] = [];
  const knownKeys = await getImportedArchiveNameKeys();
  let skipped = 0;

  for (let i = 0; i < sources.length; i += 1) {
    if (options.isCancelled?.()) break;
    const source = sources[i];
    const key = archiveNameKey(source.name);

    options.onProgress?.({
      phase: 'copying',
      current: i,
      total: sources.length,
      message: `Adding ${i + 1} of ${sources.length}: ${source.name}`,
    });

    if (key && knownKeys.has(key)) {
      skipped += 1;
      options.onProgress?.({
        phase: 'copying',
        current: i + 1,
        total: sources.length,
        message: `Already imported (same filename): ${source.name}`,
      });
      continue;
    }

    try {
      const comic = await importSingleSource(source, options);
      imported.push(comic);
      if (key) knownKeys.add(key);
      options.onComicImported?.(comic);
    } catch (error) {
      if (isCancelledError(error)) {
        break;
      }
      if (error instanceof DuplicateComicError) {
        skipped += 1;
        if (key) knownKeys.add(key);
        options.onProgress?.({
          phase: 'copying',
          current: i + 1,
          total: sources.length,
          message: `Already imported (same filename): ${source.name}`,
        });
        continue;
      }
      const reason = errorReason(error);
      failures.push({ fileName: source.name, reason });
      console.warn('Import failed for', source.name, error);
      options.onProgress?.({
        phase: 'error',
        current: i + 1,
        total: sources.length,
        message: `Failed ${source.name}: ${reason}`,
      });
    }
  }

  const summaryMessage = buildImportSummary(imported.length, skipped, failures);
  options.onProgress?.({
    phase: failures.length > 0 && imported.length === 0 ? 'error' : 'done',
    current: sources.length,
    total: sources.length,
    message: summaryMessage,
  });

  return {
    comics: imported,
    failures,
    skippedDuplicates: skipped,
    summaryMessage,
  };
}

/**
 * Android: pick a folder via Storage Access Framework and add every
 * .cbz / .zip found in that folder (top level only) to the library.
 */
export async function pickFolderAndImportComics(
  options: ImportOptions = {},
): Promise<FolderImportResult> {
  if (Platform.OS !== 'android') {
    throw new Error(
      'Selecting a comics folder is available on Android. On iOS this needs a different picker in a later build.',
    );
  }

  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted || !permissions.directoryUri) {
    return {
      comics: [],
      failures: [],
      skippedDuplicates: 0,
      summaryMessage: 'Folder access was not granted.',
    };
  }

  options.onProgress?.({
    phase: 'copying',
    current: 0,
    total: 1,
    message: 'Scanning folder…',
  });

  const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(permissions.directoryUri);

  const sources: ImportSource[] = uris
    .map((uri) => ({ uri, name: archiveBasename(uri) || 'comic.cbz' }))
    .filter((s) => isComicArchiveName(s.name));

  if (sources.length === 0) {
    throw new Error('No CBZ or ZIP files found in that folder.');
  }

  return importSources(sources, options);
}
