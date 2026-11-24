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

export function useComicImport() {
  const refresh = useLibraryStore((s) => s.refresh);
  const upsertLocal = useLibraryStore((s) => s.upsertLocal);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const cancelled = useRef(false);

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
    if (importing) setModalVisible(true);
  }, [importing]);

  const selectFolder = useCallback(async (): Promise<FolderImportResult> => {
    if (importing) {
      setModalVisible(true);
      return EMPTY_IMPORT_RESULT;
    }

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
      setImporting(false);
      setModalVisible(false);
      setProgress(null);
    }
  }, [importing, refresh, upsertLocal]);

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
