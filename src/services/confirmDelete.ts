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

async function refreshLibraryBestEffort(): Promise<void> {
  try {
    await useLibraryStore.getState().refresh();
  } catch {
    // UI may still be stale; caller already surfaces the primary error.
  }
}

async function finishDelete(
  comicId: string,
  result: DeleteResult,
  options: ConfirmDeleteOptions,
  titleWhenPartial: string,
) {
  useLibraryStore.getState().removeLocal(comicId);
  await refreshLibraryBestEffort();
  options.onDeleted?.();
  const message = buildDeleteUserMessage(result);
  if (message && result.appDeleted && !result.deviceDeleted && result.deviceDeleteError) {
    Alert.alert(titleWhenPartial, message);
  }
}

/** Shared confirm → choose app-only or app+device delete. */
export function confirmDeleteComic(
  comicId: string,
  title: string,
  options: ConfirmDeleteOptions = {},
) {
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
              useLibraryStore.getState().removeLocal(comicId);
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
              useLibraryStore.getState().removeLocal(comicId);
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
}

/** Clear all extracted comics from app storage. Originals on device are kept. */
export function confirmClearLibrarySandbox(options: { onCleared?: () => void } = {}) {
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
}
