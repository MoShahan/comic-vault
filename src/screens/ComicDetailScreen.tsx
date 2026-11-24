import { useCallback, useEffect, useState } from 'react';

import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getComicById,
  setComicFavorite,
  setComicRead,
} from '@/db/comicRepository';
import { readingProgressRatio } from '@/library/selectors';
import { confirmDeleteComic } from '@/services/confirmDelete';
import { repairComic } from '@/services/repairComic';
import { useLibraryStore } from '@/store/libraryStore';
import { useTheme, spacing, typography, radii } from '@/theme';

import type { RootStackParamList } from '@/navigation/types';
import type { Comic } from '@/types/comic';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'ComicDetail'>;

function formatLastRead(ts: number | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ComicDetailScreen({ route, navigation }: Props) {
  const { comicId } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const storeComic = useLibraryStore((s) => s.comics.find((c) => c.id === comicId) ?? null);
  const [dbComic, setDbComic] = useState<Comic | null>(null);
  const [repairing, setRepairing] = useState(false);

  // Prefer the store (patched live by the Reader); fall back to the last DB load.
  const comic = storeComic ?? dbComic;

  const load = useCallback(async () => {
    const row = await getComicById(comicId);
    setDbComic(row);
    if (!row) return;
    const { comics, patchComic, upsertLocal } = useLibraryStore.getState();
    if (comics.some((c) => c.id === row.id)) {
      patchComic(row.id, row);
    } else {
      upsertLocal(row);
    }
  }, [comicId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (comic) navigation.setOptions({ title: comic.title });
  }, [comic, navigation]);

  if (!comic) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Comic not found</Text>
      </View>
    );
  }

  const progressPct = Math.round(
    readingProgressRatio(comic.currentPage, comic.pageCount) * 100,
  );
  const pageLabel =
    comic.pageCount > 0
      ? `Page ${Math.min(comic.currentPage + 1, comic.pageCount)} of ${comic.pageCount}`
      : 'No pages';
  const lastRead = formatLastRead(comic.lastReadAt);
  const hasProgress = comic.currentPage > 0;

  const toggleRead = async () => {
    const next = !comic.isRead;
    await setComicRead(comic.id, next);
    setDbComic({ ...comic, isRead: next });
    useLibraryStore.getState().patchComic(comic.id, { isRead: next });
  };

  const toggleFavorite = async () => {
    const next = !comic.isFavorite;
    await setComicFavorite(comic.id, next);
    setDbComic({ ...comic, isFavorite: next });
    useLibraryStore.getState().patchComic(comic.id, { isFavorite: next });
  };

  const onDelete = () => {
    confirmDeleteComic(comic.id, comic.title, {
      onDeleted: () => navigation.goBack(),
    });
  };

  const onRepair = () => {
    if (repairing) return;
    void (async () => {
      setRepairing(true);
      try {
        const result = await repairComic(comic.id);
        Alert.alert('Repaired', `Found ${result.pageCount} pages.`);
        await load();
        await useLibraryStore.getState().refresh();
      } catch (e) {
        Alert.alert('Repair failed', e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setRepairing(false);
      }
    })();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.lg,
      }}
    >
      <View style={styles.hero}>
        <Image
          source={{ uri: comic.coverPath }}
          style={[styles.cover, { backgroundColor: colors.surfaceMuted }]}
          contentFit="cover"
        />
        <View style={styles.heroMeta}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={3}>
            {comic.title}
          </Text>
          {comic.series ? (
            <Text style={[styles.series, { color: colors.accent }]} numberOfLines={2}>
              {comic.series}
            </Text>
          ) : null}

          <View style={styles.badgeRow}>
            {comic.isFavorite ? (
              <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.badgeText, { color: colors.accent }]}>Favorite</Text>
              </View>
            ) : null}
            {comic.isRead ? (
              <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>Read</Text>
              </View>
            ) : hasProgress ? (
              <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.badgeText, { color: colors.muted }]}>Reading</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.badgeText, { color: colors.muted }]}>Unread</Text>
              </View>
            )}
          </View>

          <View style={styles.progressBlock}>
            <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.progressFill,
                    width: `${Math.min(100, Math.max(0, progressPct))}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.muted }]}>
              {pageLabel} · {progressPct}%
            </Text>
            {lastRead ? (
              <Text style={[styles.progressLabel, { color: colors.muted }]}>
                Last read {lastRead}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={() => navigation.navigate('Reader', { comicId: comic.id })}
        >
          <Text style={styles.primaryText}>
            {hasProgress ? 'Continue reading' : 'Start reading'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() =>
            navigation.navigate('Reader', {
              comicId: comic.id,
              startFromBeginning: true,
            })
          }
        >
          <Text style={[styles.linkText, { color: colors.muted }]}>Read from start</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Library</Text>
        <View style={styles.toggleRow}>
          <View style={styles.manageCopy}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Finished</Text>
            <Text style={[styles.rowDetail, { color: colors.muted }]}>
              {comic.isRead ? 'Marked as read' : 'Still open'}
            </Text>
          </View>
          <Switch
            value={comic.isRead}
            onValueChange={() => void toggleRead()}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.toggleRow}>
          <View style={styles.manageCopy}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Favorite</Text>
            <Text style={[styles.rowDetail, { color: colors.muted }]}>
              {comic.isFavorite ? 'Pinned in Favorites filter' : 'Not pinned'}
            </Text>
          </View>
          <Switch
            value={comic.isFavorite}
            onValueChange={() => void toggleFavorite()}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Manage</Text>
        <Pressable
          disabled={repairing}
          style={({ pressed }) => [
            styles.manageRow,
            { opacity: repairing ? 0.45 : pressed ? 0.7 : 1 },
          ]}
          onPress={onRepair}
        >
          <View style={styles.manageCopy}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {repairing ? 'Repairing…' : 'Repair pages'}
            </Text>
            <Text style={[styles.rowDetail, { color: colors.muted }]}>
              Re-extract images if pages are missing or broken
            </Text>
          </View>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          style={({ pressed }) => [styles.manageRow, { opacity: pressed ? 0.7 : 1 }]}
          onPress={onDelete}
        >
          <View style={styles.manageCopy}>
            <Text style={[styles.rowLabel, { color: colors.danger }]}>Delete comic</Text>
            <Text style={[styles.rowDetail, { color: colors.muted }]}>
              Remove from this app, or from the device
            </Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  cover: {
    width: 128,
    aspectRatio: 2 / 3,
    borderRadius: radii.md,
  },
  heroMeta: {
    flex: 1,
    minHeight: 128 * 1.5,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  title: { ...typography.title, fontSize: 22, lineHeight: 28 },
  series: { ...typography.caption, marginTop: spacing.xs },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  badgeText: { ...typography.caption, fontSize: 11 },
  progressBlock: { marginTop: spacing.sm, gap: spacing.xs },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: { ...typography.caption },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  primary: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', ...typography.button },
  linkBtn: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  linkText: { ...typography.caption },
  sectionLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  manageCopy: { flex: 1, gap: 2 },
  rowLabel: { ...typography.subtitle, fontSize: 16 },
  rowDetail: { ...typography.caption },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
});
