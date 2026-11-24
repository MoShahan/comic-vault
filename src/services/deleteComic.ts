import * as FileSystem from 'expo-file-system/legacy';

import { deleteAllComicRows, deleteComicRow, getComicById } from '@/db/comicRepository';
import { comicSandboxDir, comicsRoot } from '@/services/paths';

import type { DeleteResult } from '@/types/comic';

async function deleteSandboxFolder(comicId: string): Promise<void> {
  // Derive from id + guard — never trust a string-replaced pagesDir root.
  const path = comicSandboxDir(comicId);
  await FileSystem.deleteAsync(path, { idempotent: true });
}

async function removeAppCopy(id: string): Promise<boolean> {
  const comic = await getComicById(id);
  if (!comic) return false;
  await deleteSandboxFolder(comic.id);
  await deleteComicRow(id);
  return true;
}

/** Remove from Comic Vault only - original CBZ on device is kept. */
export async function deleteComicFromApp(id: string): Promise<DeleteResult> {
  const removed = await removeAppCopy(id);
  return {
    appDeleted: removed,
    deviceDeleted: false,
    deviceDeleteError: removed ? undefined : 'Comic not found',
  };
}

/**
 * Remove from Comic Vault and delete the original file on device when possible.
 */
export async function deleteComicFromDevice(id: string): Promise<DeleteResult> {
  const comic = await getComicById(id);
  if (!comic) {
    return {
      appDeleted: false,
      deviceDeleted: false,
      deviceDeleteError: 'Comic not found',
    };
  }

  const sourceUri = comic.sourceUri;
  await deleteSandboxFolder(comic.id);
  await deleteComicRow(id);

  let deviceDeleted = false;
  let deviceDeleteError: string | undefined;

  if (sourceUri) {
    try {
      const info = await FileSystem.getInfoAsync(sourceUri);
      if (info.exists) {
        await FileSystem.deleteAsync(sourceUri, { idempotent: true });
        deviceDeleted = true;
      } else {
        deviceDeleteError =
          'Removed from Comic Vault, but the original file was not found (it may have been moved).';
      }
    } catch {
      deviceDeleteError =
        'Removed from Comic Vault, but the original file on your device could not be deleted (permission or location). Delete it manually if needed.';
    }
  } else {
    deviceDeleteError =
      'Removed from Comic Vault. No original file path was stored, so nothing was deleted on device.';
  }

  return { appDeleted: true, deviceDeleted, deviceDeleteError };
}

/** @deprecated Prefer deleteComicFromApp / deleteComicFromDevice */
export async function deleteComicCompletely(id: string): Promise<DeleteResult> {
  return deleteComicFromDevice(id);
}

/**
 * Wipe extracted comics + DB rows from the app sandbox.
 * Does not delete original CBZ files in the user’s folder.
 */
export async function clearLibrarySandbox(): Promise<void> {
  try {
    await FileSystem.deleteAsync(comicsRoot(), { idempotent: true });
  } catch {
    // documentDirectory unavailable — still clear DB rows.
  }
  await deleteAllComicRows();
}
