import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReaderChrome } from '@/components/ReaderChrome';
import { ReaderPage } from '@/components/ReaderPage';
import { useReaderState } from '@/hooks/useReaderState';

import type { RootStackParamList } from '@/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

/** Keep current ± this many steps mounted so swipes/taps have a ready page. */
const PAGE_WINDOW = 2;

export function ReaderScreen({ route, navigation }: Props) {
  const { comicId, startFromBeginning } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  /** True when stepIndex was updated from a user swipe (skip programmatic re-sync). */
  const skipProgrammaticScroll = useRef(false);
  const isFirstStepSync = useRef(true);
  const lastStepIndex = useRef(0);

  const reader = useReaderState(comicId, { startFromBeginning });
  const {
    comic,
    steps,
    stepIndex,
    positionReady,
    loadError,
    goToStep,
    chromeVisible,
    toggleChrome,
    zoomed,
    setZoomed,
    markRead,
  } = reader;

  const stepIndexRef = useRef(stepIndex);
  const zoomedRef = useRef(zoomed);
  const isReadRef = useRef(comic?.isRead ?? false);

  useLayoutEffect(() => {
    stepIndexRef.current = stepIndex;
    zoomedRef.current = zoomed;
    isReadRef.current = comic?.isRead ?? false;
  }, [stepIndex, zoomed, comic?.isRead]);

  useEffect(() => {
    void activateKeepAwakeAsync('reader');
    return () => {
      void deactivateKeepAwake('reader');
    };
  }, []);

  // Stable across page changes so ReaderPage gestures are not rebuilt every step.
  const goNext = useCallback(() => {
    goToStep(stepIndexRef.current + 1);
  }, [goToStep]);

  const goPrev = useCallback(() => {
    goToStep(stepIndexRef.current - 1);
  }, [goToStep]);

  const onTapLeft = useCallback(() => {
    if (zoomedRef.current) return;
    goPrev();
  }, [goPrev]);

  const onTapRight = useCallback(() => {
    if (zoomedRef.current) return;
    goNext();
  }, [goNext]);

  const onBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const onToggleRead = useCallback(() => {
    void markRead(!isReadRef.current);
  }, [markRead]);

  // Animate programmatic page changes (tap zones / scrubber / vertical swipe).
  useEffect(() => {
    if (!positionReady) return;

    if (isFirstStepSync.current) {
      isFirstStepSync.current = false;
      lastStepIndex.current = stepIndex;
      return;
    }

    if (skipProgrammaticScroll.current) {
      skipProgrammaticScroll.current = false;
      lastStepIndex.current = stepIndex;
      return;
    }

    const delta = Math.abs(stepIndex - lastStepIndex.current);
    lastStepIndex.current = stepIndex;

    if (delta <= 1) {
      pagerRef.current?.setPage(stepIndex);
    } else {
      pagerRef.current?.setPageWithoutAnimation(stepIndex);
    }
  }, [stepIndex, positionReady]);

  if (loadError) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + 16 }]}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>Can’t open reader</Text>
        <Text style={styles.loadingText}>{loadError}</Text>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={12}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!comic || steps.length === 0 || !positionReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#E8A54B" />
        <Text style={styles.loadingText}>Loading pages…</Text>
      </View>
    );
  }

  const activeStep = steps[stepIndex] ?? steps[steps.length - 1];
  const pageLabel = `Page ${activeStep.pageIndex + 1} / ${comic.pageCount}`;

  return (
    <View style={styles.root}>
      <StatusBar hidden={!chromeVisible} style="light" />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={stepIndex}
        scrollEnabled={!zoomed}
        offscreenPageLimit={PAGE_WINDOW}
        overdrag
        onPageSelected={(e) => {
          const index = e.nativeEvent.position;
          if (index !== stepIndexRef.current) {
            skipProgrammaticScroll.current = true;
            goToStep(index);
          }
        }}
      >
        {steps.map((step, index) => (
          <View key={`${step.pageIndex}-${step.half}-${index}`} style={{ width, height }}>
            {Math.abs(index - stepIndex) <= PAGE_WINDOW ? (
              <ReaderPage
                uri={step.uri}
                half={step.half}
                isActive={index === stepIndex}
                onZoomChange={setZoomed}
                onTapCenter={toggleChrome}
                onTapLeft={onTapLeft}
                onTapRight={onTapRight}
                onSwipeUp={goNext}
                onSwipeDown={goPrev}
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: '#000' }} />
            )}
          </View>
        ))}
      </PagerView>

      <ReaderChrome
        visible={chromeVisible}
        title={comic.title}
        isRead={comic.isRead}
        pageLabel={pageLabel}
        stepIndex={stepIndex}
        stepCount={steps.length}
        onBack={onBack}
        onToggleRead={onToggleRead}
        onScrub={goToStep}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  pager: { flex: 1 },
  loading: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { color: '#9AA3B2', textAlign: 'center', lineHeight: 20 },
  errorTitle: { color: '#F2F4F8', fontSize: 18, fontWeight: '600' },
  backButton: {
    marginTop: 8,
    backgroundColor: '#2A2F3A',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: { color: '#F2F4F8', fontWeight: '700' },
});
