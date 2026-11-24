import { useCallback, useEffect, useMemo, useState } from 'react';

import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Image, type ImageLoadEventData } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { SpreadHalf } from '@/types/comic';

type Props = {
  uri: string;
  half: SpreadHalf;
  /** Current pager step — reset local zoom when this page is left. */
  isActive: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onTapCenter: () => void;
  onTapLeft: () => void;
  onTapRight: () => void;
  /** Swipe up → next page (when not zoomed). */
  onSwipeUp?: () => void;
  /** Swipe down → previous page (when not zoomed). */
  onSwipeDown?: () => void;
};

const TOP_GAP = 50;
const BOTTOM_GAP = 12;
const VERTICAL_ACTIVATE = 18;
const VERTICAL_TURN = 42;
const VERTICAL_VELOCITY = 450;

type NaturalSize = { width: number; height: number };

function clampZoomPan(
  nextTx: number,
  nextTy: number,
  nextScale: number,
  boundW: number,
  boundH: number,
): { x: number; y: number } {
  'worklet';
  const maxX = Math.max(0, ((nextScale - 1) * boundW) / 2);
  const maxY = Math.max(0, ((nextScale - 1) * boundH) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, nextTx)),
    y: Math.min(maxY, Math.max(-maxY, nextTy)),
  };
}

export function ReaderPage({
  uri,
  half,
  isActive,
  onZoomChange,
  onTapCenter,
  onTapLeft,
  onTapRight,
  onSwipeUp,
  onSwipeDown,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = insets.top + TOP_GAP;
  const bottomInset = insets.bottom + BOTTOM_GAP;
  const contentHeight = Math.max(1, height - topInset - bottomInset);
  const isSpreadHalf = half === 'left' || half === 'right';

  const [natural, setNatural] = useState<NaturalSize | null>(null);

  const onLoad = useCallback((event: ImageLoadEventData) => {
    const w = event.source.width;
    const h = event.source.height;
    if (w > 0 && h > 0) {
      setNatural({ width: w, height: h });
    }
  }, []);

  useEffect(() => {
    setNatural(null);
  }, [uri, half]);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const boundW = useSharedValue(width);
  const boundH = useSharedValue(contentHeight);
  const isActiveSV = useSharedValue(isActive);

  // Sync layout / active flags onto the UI thread (SharedValue writes; see eslint override).
  boundW.value = width;
  boundH.value = contentHeight;
  isActiveSV.value = isActive;

  useAnimatedReaction(
    () => isActiveSV.value,
    (active, prev) => {
      if (!active && prev) {
        scale.value = 1;
        tx.value = 0;
        ty.value = 0;
      }
    },
  );

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(4, Math.max(1, startScale.value * e.scale));
      const clamped = clampZoomPan(tx.value, ty.value, scale.value, boundW.value, boundH.value);
      tx.value = clamped.x;
      ty.value = clamped.y;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        scheduleOnRN(onZoomChange, false);
      } else {
        const clamped = clampZoomPan(tx.value, ty.value, scale.value, boundW.value, boundH.value);
        tx.value = withTiming(clamped.x);
        ty.value = withTiming(clamped.y);
        scheduleOnRN(onZoomChange, true);
      }
    });

  // Pan-to-move only while zoomed (lets horizontal pager keep left/right swipes).
  const zoomPan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, state) => {
      if (scale.value > 1.05) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onBegin(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const clamped = clampZoomPan(
        startTx.value + e.translationX,
        startTy.value + e.translationY,
        scale.value,
        boundW.value,
        boundH.value,
      );
      tx.value = clamped.x;
      ty.value = clamped.y;
    });

  // Vertical page turns live on the page (PagerView steals parent pans).
  const verticalTurn = Gesture.Pan()
    .maxPointers(1)
    .manualActivation(true)
    .onTouchesDown((e) => {
      const t = e.allTouches[0];
      if (!t) return;
      touchStartX.value = t.x;
      touchStartY.value = t.y;
    })
    .onTouchesMove((e, state) => {
      if (scale.value > 1.05) {
        state.fail();
        return;
      }
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.x - touchStartX.value;
      const dy = t.y - touchStartY.value;
      if (Math.abs(dy) > VERTICAL_ACTIVATE && Math.abs(dy) > Math.abs(dx) * 1.15) {
        state.activate();
      } else if (Math.abs(dx) > VERTICAL_ACTIVATE && Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal → let PagerView change pages.
        state.fail();
      }
    })
    .onEnd((e) => {
      if (scale.value > 1.05) return;
      const up =
        e.translationY < -VERTICAL_TURN || e.velocityY < -VERTICAL_VELOCITY;
      const down =
        e.translationY > VERTICAL_TURN || e.velocityY > VERTICAL_VELOCITY;
      if (up && onSwipeUp) scheduleOnRN(onSwipeUp);
      else if (down && onSwipeDown) scheduleOnRN(onSwipeDown);
    });

  const edgeLeft = width * 0.28;
  const edgeRight = width * 0.72;

  // Edge page turns must not wait on double-tap recognition (that ~500ms lag
  // made every turn feel slow and turned rapid edge taps into zoom).
  const edgeTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      if (scale.value > 1.05) return;
      if (e.x < edgeLeft) scheduleOnRN(onTapLeft);
      else if (e.x > edgeRight) scheduleOnRN(onTapRight);
    });

  // Double-tap zoom only in the center band so it cannot steal edge turns.
  const centerDoubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .maxDelay(220)
    .onEnd((e) => {
      if (e.x < edgeLeft || e.x > edgeRight) return;
      if (scale.value > 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        scheduleOnRN(onZoomChange, false);
      } else {
        scale.value = withTiming(2.2);
        scheduleOnRN(onZoomChange, true);
      }
    });

  const centerSingleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      if (scale.value > 1.05) return;
      if (e.x >= edgeLeft && e.x <= edgeRight) scheduleOnRN(onTapCenter);
    });

  const composed = Gesture.Simultaneous(
    pinch,
    zoomPan,
    verticalTurn,
    edgeTap,
    Gesture.Exclusive(centerDoubleTap, centerSingleTap),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const spreadLayout = useMemo(() => {
    if (!isSpreadHalf || !natural) return null;

    // Contain one half in the viewport.
    const scaleX = width / (natural.width / 2);
    const scaleY = contentHeight / natural.height;
    const fit = Math.min(scaleX, scaleY);
    const fullW = natural.width * fit;
    const fullH = natural.height * fit;

    // Center the visible half horizontally and the whole image vertically.
    const left =
      half === 'left' ? width / 2 - fullW / 4 : width / 2 - (3 * fullW) / 4;
    const top = (contentHeight - fullH) / 2;

    return { fullW, fullH, left, top };
  }, [isSpreadHalf, half, natural, width, contentHeight]);

  const fullContentPosition = 'center';

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.page, { width, height }]} pointerEvents="box-only">
        <View
          style={[
            styles.clip,
            {
              width,
              height: contentHeight,
              marginTop: topInset,
              marginBottom: bottomInset,
            },
          ]}
        >
          <Animated.View style={[{ width, height: contentHeight }, animStyle]}>
            {isSpreadHalf ? (
              <View style={[styles.spreadViewport, { width, height: contentHeight }]}>
                <Image
                  source={{ uri }}
                  onLoad={onLoad}
                  style={
                    spreadLayout
                      ? {
                          position: 'absolute',
                          width: spreadLayout.fullW,
                          height: spreadLayout.fullH,
                          left: spreadLayout.left,
                          top: spreadLayout.top,
                        }
                      : {
                          // Until size is known: double-wide contain, vertically centered.
                          width: width * 2,
                          height: contentHeight,
                          marginLeft: half === 'right' ? -width : 0,
                        }
                  }
                  contentFit={spreadLayout ? 'fill' : 'contain'}
                  contentPosition="center"
                  recyclingKey={`${uri}-${half}-spread`}
                  cachePolicy="memory-disk"
                  transition={0}
                />
              </View>
            ) : (
              <Image
                source={{ uri }}
                style={{ width, height: contentHeight }}
                contentFit="contain"
                contentPosition={fullContentPosition}
                recyclingKey={`${uri}-full`}
                cachePolicy="memory-disk"
                transition={120}
              />
            )}
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#000', overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  spreadViewport: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
});
