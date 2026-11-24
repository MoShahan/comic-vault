export type SpreadHalf = 'full' | 'left' | 'right';
export type FitMode = 'width' | 'screen';
export type ReadingDirection = 'ltr';
export type ThemeMode = 'system' | 'light' | 'dark';

export type Comic = {
  id: string;
  title: string;
  series: string | null;
  sourceUri: string | null;
  /**
   * Original archive filename (e.g. `Batman #01.cbz`).
   * Duplicate detection is case-insensitive on this basename (not full path).
   */
  sourceFileName: string | null;
  /** Resolved file URI for the cover image (DB stores id-relative under `comics/`). */
  coverPath: string;
  /** Resolved file URI for the pages directory (DB stores id-relative under `comics/`). */
  pagesDir: string;
  pageCount: number;
  currentPage: number;
  spreadHalf: SpreadHalf;
  isRead: boolean;
  isFavorite: boolean;
  fitMode: FitMode;
  readingDirection: ReadingDirection;
  lastReadAt: number | null;
  importedAt: number;
};

export type AppSettings = {
  themeMode: ThemeMode;
  autoSplitSpreads: boolean;
  defaultFit: FitMode;
  defaultDirection: ReadingDirection;
};

export type LibraryFilter = 'all' | 'unread' | 'in_progress' | 'finished' | 'favorites';
export type LibrarySort = 'recent' | 'title' | 'progress';
export type SortDirection = 'asc' | 'desc';

export type ImportProgress = {
  phase: 'copying' | 'extracting' | 'saving' | 'done' | 'cancelled' | 'error';
  current: number;
  total: number;
  message: string;
};

export type DeleteResult = {
  appDeleted: boolean;
  deviceDeleted: boolean;
  deviceDeleteError?: string;
};
