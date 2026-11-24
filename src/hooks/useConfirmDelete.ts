import { useCallback } from 'react';

import { Alert } from 'react-native';

import {
  clearLibrarySandbox,
  deleteComicFromApp,
  deleteComicFromDevice,
} from '@/services/deleteComic';
import { buildDeleteUserMessage } from '@/services/deleteMessaging';
import { useLibraryStore } from '@/store/libraryStore';

import type { DeleteResult } from '@/types/comic';

type ConfirmDeleteOptions = {
  onDeleted?: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

/**
 * Confirm dialogs + library store updates for delete / clear-sandbox.
 * Keeps Alert and Zustand out of `services/`.
 */
export function useConfirmDelete() {
  const removeLocal = useLibraryStore((s) => s.removeLocal);
  const refresh = useLibraryStore((s) => s.refresh);

  const refreshLibraryBestEffort = useCallback(async () => {
    try {
      await refresh();
    } catch {
      // UI may still be stale; caller already surfaces the primary error.
    }
  }, [refresh]);

  const finishDelete = useCallback(
    async (
      comicId: string,
      result: DeleteResult,
      options: ConfirmDeleteOptions,
      titleWhenPartial: string,
    ) => {
      removeLocal(comicId);
      await refreshLibraryBestEffort();
      options.onDeleted?.();
      const message = buildDeleteUserMessage(result);
      if (message && result.appDeleted && !result.deviceDeleted && result.deviceDeleteError) {
        Alert.alert(titleWhenPartial, message);
      }
    },
    [removeLocal, refreshLibraryBestEffort],
  );

  const confirmDeleteComic = useCallback(
    (comicId: string, title: string, options: ConfirmDeleteOptions = {}) => {
      Alert.alert(
        'Delete this comic?',
        `“${title}”\n\n• From this app - remove from your shelf (keeps the CBZ on your device)\n• From device - remove from the app and delete the original CBZ file`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'From this app',
            onPress: () => {
              void (async () => {
                try {
                  const result = await deleteComicFromApp(comicId);
                  await finishDelete(comicId, result, options, 'Deleted from app');
                } catch (error) {
                  removeLocal(comicId);
                  await refreshLibraryBestEffort();
                  Alert.alert(
                    'Delete failed',
                    errorMessage(error, 'Could not remove this comic from the app.'),
                  );
                }
              })();
            },
          },
          {
            text: 'From device',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  const result = await deleteComicFromDevice(comicId);
                  await finishDelete(comicId, result, options, 'Deleted from library');
                } catch (error) {
                  removeLocal(comicId);
                  await refreshLibraryBestEffort();
                  Alert.alert(
                    'Delete failed',
                    errorMessage(
                      error,
                      'Could not finish deleting this comic. Check the library and your files.',
                    ),
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [finishDelete, removeLocal, refreshLibraryBestEffort],
  );

  const confirmClearLibrarySandbox = useCallback(
    (options: { onCleared?: () => void } = {}) => {
      Alert.alert(
        'Clear app library?',
        'This deletes every comic from Comic Vault’s private storage (extracted pages and copies). Your original CBZ files in the folder you selected are not deleted. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear sandbox',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await clearLibrarySandbox();
                  await refreshLibraryBestEffort();
                  options.onCleared?.();
                  Alert.alert(
                    'Library cleared',
                    'App sandbox storage was freed. Select a folder again to re-add comics.',
                  );
                } catch (error) {
                  await refreshLibraryBestEffort();
                  Alert.alert(
                    'Clear failed',
                    errorMessage(error, 'Could not clear the app library sandbox.'),
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [refreshLibraryBestEffort],
  );

  return { confirmDeleteComic, confirmClearLibrarySandbox };
}
