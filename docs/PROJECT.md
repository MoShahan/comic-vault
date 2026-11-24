# Project details

## Why this exists

Built for **personal use on your own device** (Expo Go). Comics stay on your phone. Reading progress and preferences are saved locally with SQLite. **Mark as read is always a conscious choice** - finishing the last page never auto-marks a comic.

## Tech stack

- **Expo SDK 57** · React Native · TypeScript
- **expo-sqlite** for library metadata & settings
- **expo-file-system** + **fflate** for CBZ extract
- **React Navigation** · **Zustand** · **expo-image**

## Project structure

```text
src/
├── components/     # Cards, reader page, overlay, import modal
├── db/             # SQLite (comics + settings)
├── hooks/          # Library, import, reader state
├── library/        # Pure selectors (filter, sort, spreads)
├── navigation/     # Tabs + stack
├── screens/        # Library, Detail, Reader, Settings
├── services/       # Folder add, extract, delete, repair, storage
├── store/          # Zustand library UI state
├── theme/          # Light/dark tokens + provider
└── types/          # Shared TypeScript types
```

## Storage & privacy

| Data                  | Where it lives                                     |
| --------------------- | -------------------------------------------------- |
| Page images           | App private storage (`documentDirectory/comics/…`) |
| Progress & settings   | Local SQLite (`comicvault.db`)                     |
| Folder scan / extract | Temporary work under app storage during add        |

- SQLite stores **id-relative** paths under `comics/` (e.g. `c_abc/pages/`); full `file://` URIs are resolved at runtime so iOS container path changes don’t break covers/pages
- On startup, orphan `comics/<id>/` folders with no library row (e.g. killed mid-import) are deleted
- Originals on your phone are left alone until you confirm **Delete**
- No network calls for comics, no telemetry, no accounts
