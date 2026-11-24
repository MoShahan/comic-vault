import { useCallback, useEffect, useRef, useState } from 'react';

import { isCancelledError } from '@/services/extractCbz';
import {
  pickFolderAndImportComics,
  type FolderImportResult,
} from '@/services/importComic';
import { useLibraryStore } from '@/store/libraryStore';

import type { ImportProgress } from '@/types/comic';

const EMPTY_IMPORT_RESULT: FolderImportResult = {
  comics: [],
  failures: [],
  skippedDuplicates: 0,
  summaryMessage: '',
};

/**
 * Owns folder-import UI state (progress modal, cancel, in-flight guard).
 * Kept out of screens so Library can stay mostly presentational, and so a
 * double-tap cannot start two imports before React re-renders `importing`.
 */
export function useComicImport() {
  const refresh = useLibraryStore((s) => s.refresh);
  const upsertLocal = useLibraryStore((s) => s.upsertLocal);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const cancelled = useRef(false);
  /** Sync guard — `importing` state alone can miss a double-tap before re-render. */
  const inFlight = useRef(false);

  const cancel = useCallback(() => {
    cancelled.current = true;
    setProgress({
      phase: 'cancelled',
      current: 0,
      total: 0,
      message: 'Cancelling…',
    });
  }, []);

  const runInBackground = useCallback(() => {
    setModalVisible(false);
  }, []);

  const showProgressModal = useCallback(() => {
    if (inFlight.current) setModalVisible(true);
  }, []);

  const selectFolder = useCallback(async (): Promise<FolderImportResult> => {
    if (inFlight.current) {
      setModalVisible(true);
      return EMPTY_IMPORT_RESULT;
    }

    inFlight.current = true;
    cancelled.current = false;
    setImporting(true);
    setModalVisible(true);
    setProgress({
      phase: 'copying',
      current: 0,
      total: 1,
      message: 'Starting…',
    });
    try {
      const result = await pickFolderAndImportComics({
        onProgress: setProgress,
        onComicImported: upsertLocal,
        isCancelled: () => cancelled.current,
      });
      if (result.comics.length) await refresh();
      return result;
    } catch (error) {
      if (isCancelledError(error)) {
        return EMPTY_IMPORT_RESULT;
      }
      throw error;
    } finally {
      inFlight.current = false;
      setImporting(false);
      setModalVisible(false);
      setProgress(null);
    }
  }, [refresh, upsertLocal]);

  return {
    selectFolder,
    cancel,
    runInBackground,
    showProgressModal,
    importing,
    modalVisible,
    progress,
  };
}

/**
 * Thin shelf subscription + initial DB refresh for Library.
 * Filter/sort live in the store so they survive tab switches; this hook just
 * exposes them and kicks `refresh()` once on mount.
 */
export function useLibrary() {
  const loading = useLibraryStore((s) => s.loading);
  const filter = useLibraryStore((s) => s.filter);
  const sort = useLibraryStore((s) => s.sort);
  const sortDirection = useLibraryStore((s) => s.sortDirection);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const setSort = useLibraryStore((s) => s.setSort);
  const refresh = useLibraryStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, filter, sort, sortDirection, setFilter, setSort, refresh };
}
