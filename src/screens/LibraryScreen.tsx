import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComicCard } from '@/components/ComicCard';
import { ContinueCard } from '@/components/ContinueCard';
import { ImportProgressModal } from '@/components/ImportProgressModal';
import { LibraryControls } from '@/components/LibraryControls';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { useComicImport, useLibrary } from '@/hooks/useLibrary';
import {
  selectContinueComic as pickContinueComic,
  selectVisibleComics as pickVisibleComics,
} from '@/library/selectors';
import { isCancelledError } from '@/services/extractCbz';
import { useLibraryStore } from '@/store/libraryStore';
import { useTheme, spacing, typography, radii } from '@/theme';

import type { RootStackParamList } from '@/navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * Personal shelf: continue card, filter/sort grid, folder import.
 * Import progress modal is mounted once on the screen root so empty→grid
 * transitions (first comic arriving) do not remount/flicker the modal.
 */
export function LibraryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { loading, filter, sort, sortDirection, setFilter, setSort } = useLibrary();
  const { confirmDeleteComic } = useConfirmDelete();
  const {
    selectFolder,
    cancel,
    runInBackground,
    showProgressModal,
    importing,
    modalVisible,
    progress,
  } = useComicImport();

  // Subscribe to stable store slices only — derived lists must be memoized
  // (selectors that return new arrays break useSyncExternalStore / getSnapshot).
  const allComics = useLibraryStore((s) => s.comics);
  // Tab stays mounted under the stack. While blurred (e.g. Reader open), freeze
  // the shelf snapshot so progress patchComic ticks do not re-filter/re-sort.
  const [shelfComics, setShelfComics] = useState(allComics);
  useEffect(() => {
    if (isFocused) setShelfComics(allComics);
  }, [isFocused, allComics]);

  const comics = useMemo(
    () => pickVisibleComics(shelfComics, filter, sort, sortDirection),
    [shelfComics, filter, sort, sortDirection],
  );
  const continueComic = useMemo(() => pickContinueComic(shelfComics), [shelfComics]);

  const gap = spacing.md;
  const cardWidth = (width - spacing.lg * 2 - gap) / 2;

  const onOpenComic = useCallback(
    (comicId: string) => {
      navigation.navigate('ComicDetail', { comicId });
    },
    [navigation],
  );

  const onDeleteComic = useCallback(
    (comicId: string, title: string) => {
      confirmDeleteComic(comicId, title);
    },
    [confirmDeleteComic],
  );

  const onContinue = useCallback(() => {
    const id = continueComic?.id;
    if (id) navigation.navigate('Reader', { comicId: id });
  }, [continueComic?.id, navigation]);

  const onSelectFolder = useCallback(() => {
    if (importing) {
      showProgressModal();
      return;
    }
    void selectFolder()
      .then((result) => {
        if (result.failures.length === 0) return;
        Alert.alert(
          result.comics.length > 0 ? 'Import finished with errors' : 'Import failed',
          result.summaryMessage,
        );
      })
      .catch((e: unknown) => {
        if (isCancelledError(e)) return;
        const message = e instanceof Error ? e.message : 'Something went wrong.';
        Alert.alert('Could not open folder', message);
      });
  }, [importing, selectFolder, showProgressModal]);

  const progressBanner =
    importing && !modalVisible ? (
      <Pressable
        onPress={showProgressModal}
        style={[
          styles.banner,
          {
            backgroundColor: colors.accentSoft,
            borderColor: colors.accent,
            bottom: insets.bottom + (allComics.length === 0 ? 24 : 72),
          },
        ]}
      >
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={[styles.bannerText, { color: colors.accent }]} numberOfLines={1}>
          {progress?.message ?? 'Adding comics…'} · Tap for details
        </Text>
      </Pressable>
    ) : null;

  const header = useMemo(
    () => (
      <View>
        <Text style={[styles.brand, { color: colors.text }]}>Comic Vault</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Your personal shelf</Text>

        {continueComic ? <ContinueCard comic={continueComic} onPress={onContinue} /> : null}

        <LibraryControls
          filter={filter}
          sort={sort}
          sortDirection={sortDirection}
          onFilterChange={setFilter}
          onSortChange={setSort}
        />
      </View>
    ),
    [
      colors,
      continueComic,
      filter,
      sort,
      sortDirection,
      setFilter,
      setSort,
      onContinue,
    ],
  );

  let body: ReactNode;
  if (loading && allComics.length === 0) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (allComics.length === 0) {
    body = (
      <View style={[styles.center, { paddingHorizontal: spacing.lg }]}>
        <Text style={[styles.brand, { color: colors.text, textAlign: 'center' }]}>
          Comic Vault
        </Text>
        <Text style={[styles.empty, { color: colors.muted }]}>
          Select a folder that contains your CBZ comics. Everything in that folder will show up
          here.
        </Text>
        <Pressable
          onPress={onSelectFolder}
          style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.primaryText}>Select folder</Text>
        </Pressable>
        {progressBanner}
      </View>
    );
  } else {
    body = (
      <>
        <FlatList
          data={comics}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + 88,
          }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={{ color: colors.muted, ...typography.body }}>
              No comics match this filter.
            </Text>
          }
          renderItem={({ item }) => (
            <ComicCard
              comic={item}
              width={cardWidth}
              onPress={onOpenComic}
              onLongPress={onDeleteComic}
            />
          )}
          initialNumToRender={6}
          windowSize={7}
          removeClippedSubviews
        />

        <Pressable
          onPress={onSelectFolder}
          style={[styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 16 }]}
        >
          <Text style={styles.fabText}>{importing ? 'Adding…' : '＋ Folder'}</Text>
        </Pressable>
        {progressBanner}
      </>
    );
  }

  // Modal stays mounted across empty ↔ library switches so first-import progress doesn’t flicker.
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {body}
      <ImportProgressModal
        visible={modalVisible}
        progress={progress}
        onCancel={cancel}
        onRunInBackground={runInBackground}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { ...typography.display, marginTop: spacing.md },
  sub: { ...typography.body, marginBottom: spacing.lg },
  empty: {
    ...typography.body,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
  primaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  primaryText: { color: '#fff', ...typography.button },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
  },
  fabText: { color: '#fff', ...typography.button },
  banner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  bannerText: { ...typography.caption, flex: 1 },
});
