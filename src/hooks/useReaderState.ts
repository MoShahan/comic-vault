import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useWindowDimensions } from 'react-native';

import { getComicById, setComicRead, updateComicProgress } from '@/db/comicRepository';
import { listPageFiles } from '@/services/extractCbz';
import { loadOrProbeSpreadFlags } from '@/services/spreadFlags';
import { useLibraryStore } from '@/store/libraryStore';
import { useTheme } from '@/theme';

import type { Comic, SpreadHalf } from '@/types/comic';

/** One pager item: a full page, or one half of an auto-split double-page spread. */
export type ReaderStep = {
  pageIndex: number;
  half: SpreadHalf;
  uri: string;
  isSpread: boolean;
};

/**
 * Reader session state: load pages, build spread steps, keep scroll position
 * stable across rotation/spread rebuilds, and debounce progress to SQLite.
 * Screens stay presentational; all of that orchestration lives here.
 */
export function useReaderState(
  comicId: string,
  options: { startFromBeginning?: boolean } = {},
) {
  const startFromBeginning = options.startFromBeginning === true;
  const { settings } = useTheme();
  const patchComic = useLibraryStore((s) => s.patchComic);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isPortrait = screenH >= screenW;

  const [comic, setComic] = useState<Comic | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [spreadFlags, setSpreadFlags] = useState<boolean[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [positionReady, setPositionReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  /** Debounced SQLite write; cleared/flushed on unmount so the last page is kept. */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Authoritative in-session position (survives step rebuilds better than React state alone). */
  const latestProgress = useRef<{ pageIndex: number; half: SpreadHalf } | null>(null);
  /** "Read from start" must run once per open — not again when steps rebuild. */
  const appliedStartFromBeginning = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setPositionReady(false);
    try {
      const row = await getComicById(comicId);
      if (!row) {
        setComic(null);
        setPages([]);
        setSpreadFlags([]);
        setLoadError('Comic not found.');
        return;
      }

      const files = await listPageFiles(row.pagesDir);
      if (files.length === 0) {
        setComic(row);
        setPages([]);
        setSpreadFlags([]);
        setLoadError('No pages found. Try Repair from the comic details.');
        return;
      }

      let flags: boolean[];
      if (!settings.autoSplitSpreads) {
        flags = files.map(() => false);
      } else {
        // Cached after first probe; batched concurrency avoids decoding every page at once.
        flags = await loadOrProbeSpreadFlags(row.pagesDir, files);
      }

      // Set comic + pages + flags together so steps never flash unsplit then jump.
      setComic(row);
      setPages(files);
      setSpreadFlags(flags);
    } catch (error) {
      setComic(null);
      setPages([]);
      setSpreadFlags([]);
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Could not load this comic.';
      setLoadError(message);
    }
  }, [comicId, settings.autoSplitSpreads]);

  useEffect(() => {
    void load();
  }, [load]);

  // Portrait + auto-split → one wide page becomes two pager steps (left then right).
  // Landscape (or split off) keeps a single full-page step so the whole spread shows.
  const steps: ReaderStep[] = useMemo(() => {
    if (!comic) return [];
    const result: ReaderStep[] = [];
    pages.forEach((uri, pageIndex) => {
      const isSpread = spreadFlags[pageIndex] === true;
      if (isSpread && isPortrait && settings.autoSplitSpreads) {
        result.push({ pageIndex, half: 'left', uri, isSpread: true });
        result.push({ pageIndex, half: 'right', uri, isSpread: true });
      } else {
        result.push({ pageIndex, half: 'full', uri, isSpread });
      }
    });
    return result;
  }, [comic, pages, spreadFlags, isPortrait, settings.autoSplitSpreads]);

  useEffect(() => {
    setPositionReady(false);
    appliedStartFromBeginning.current = false;
  }, [comicId, startFromBeginning]);

  useEffect(() => {
    if (!comic || steps.length === 0) return;

    if (startFromBeginning && !appliedStartFromBeginning.current) {
      appliedStartFromBeginning.current = true;
      setStepIndex(0);
      latestProgress.current = { pageIndex: 0, half: 'full' };
      setComic((prev) =>
        prev ? { ...prev, currentPage: 0, spreadHalf: 'full' } : prev,
      );
      void updateComicProgress(comicId, 0, 'full');
      patchComic(comicId, {
        currentPage: 0,
        spreadHalf: 'full',
        lastReadAt: Date.now(),
      });
      setPositionReady(true);
      return;
    }

    // Remap to the same page/half when steps rebuild (spread probe, rotation).
    const targetPage = latestProgress.current?.pageIndex ?? comic.currentPage;
    const targetHalf = latestProgress.current?.half ?? comic.spreadHalf;
    const idx = steps.findIndex(
      (s) =>
        s.pageIndex === targetPage &&
        (targetHalf === 'full' || s.half === targetHalf),
    );
    setStepIndex(idx >= 0 ? idx : Math.min(targetPage, steps.length - 1));
    setPositionReady(true);
  }, [comic?.id, steps.length, startFromBeginning, comicId, patchComic]); // eslint-disable-line react-hooks/exhaustive-deps

  // Orientation / spread rebuild can shrink `steps` before the position effect remaps.
  // Clamp synchronously so the next paint never reads steps[stepIndex] as undefined.
  const safeStepIndex =
    steps.length === 0 ? 0 : Math.min(Math.max(0, stepIndex), steps.length - 1);

  useLayoutEffect(() => {
    if (steps.length === 0 || stepIndex === safeStepIndex) return;
    setStepIndex(safeStepIndex);
  }, [steps.length, stepIndex, safeStepIndex]);

  // Scrub / swipe / tap leaves the zoomed page; clear global zoom so pager & edge taps work.
  useEffect(() => {
    setZoomed(false);
  }, [safeStepIndex]);

  const flushProgress = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = latestProgress.current;
    if (!pending) return;
    await updateComicProgress(comicId, pending.pageIndex, pending.half);
    patchComic(comicId, {
      currentPage: pending.pageIndex,
      spreadHalf: pending.half,
      lastReadAt: Date.now(),
    });
  }, [comicId, patchComic]);

  useEffect(() => {
    return () => {
      void flushProgress().then(() => refreshLibrary());
    };
  }, [flushProgress, refreshLibrary]);

  // Debounce DB writes while the user scrubs/swipes; unmount still flushes via flushProgress.
  const persistProgress = useCallback(
    (pageIndex: number, half: SpreadHalf) => {
      latestProgress.current = { pageIndex, half };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void updateComicProgress(comicId, pageIndex, half);
        patchComic(comicId, {
          currentPage: pageIndex,
          spreadHalf: half,
          lastReadAt: Date.now(),
        });
      }, 300);
    },
    [comicId, patchComic],
  );

  const goToStep = useCallback(
    (next: number) => {
      if (steps.length === 0) return;
      const clamped = Math.max(0, Math.min(steps.length - 1, next));
      setStepIndex(clamped);
      const step = steps[clamped];
      persistProgress(step.pageIndex, step.half);
      setComic((prev) =>
        prev
          ? {
              ...prev,
              currentPage: step.pageIndex,
              spreadHalf: step.half,
              lastReadAt: Date.now(),
            }
          : prev,
      );
    },
    [steps, persistProgress],
  );

  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);

  const markRead = useCallback(
    async (isRead: boolean) => {
      await setComicRead(comicId, isRead);
      setComic((prev) => (prev ? { ...prev, isRead } : prev));
      patchComic(comicId, { isRead });
    },
    [comicId, patchComic],
  );

  return {
    comic,
    steps,
    stepIndex: safeStepIndex,
    positionReady,
    loadError,
    goToStep,
    chromeVisible,
    toggleChrome,
    zoomed,
    setZoomed,
    markRead,
    flushProgress,
  };
}
