import { memo, useState } from 'react';

import { StyleSheet, View } from 'react-native';

import { ReaderOverlay } from '@/components/ReaderOverlay';

type Props = {
  visible: boolean;
  title: string;
  isRead: boolean;
  pageLabel: string;
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
  onToggleRead: () => void;
  onScrub: (index: number) => void;
};

/**
 * Owns dimmer state so slider drags re-render only chrome, not mounted ReaderPages.
 */
function ReaderChromeComponent({
  visible,
  title,
  isRead,
  pageLabel,
  stepIndex,
  stepCount,
  onBack,
  onToggleRead,
  onScrub,
}: Props) {
  const [dimmer, setDimmer] = useState(0);

  return (
    <>
      <View
        pointerEvents="none"
        style={[styles.dimmer, { opacity: dimmer, backgroundColor: '#000' }]}
      />
      <ReaderOverlay
        visible={visible}
        title={title}
        isRead={isRead}
        pageLabel={pageLabel}
        stepIndex={stepIndex}
        stepCount={stepCount}
        dimmer={dimmer}
        onBack={onBack}
        onToggleRead={onToggleRead}
        onScrub={onScrub}
        onDimmer={setDimmer}
      />
    </>
  );
}

export const ReaderChrome = memo(ReaderChromeComponent);

const styles = StyleSheet.create({
  dimmer: { ...StyleSheet.absoluteFill },
});
