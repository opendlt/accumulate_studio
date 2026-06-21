import React, { useCallback } from 'react';
import Joyride, { type CallBackProps, STATUS } from 'react-joyride';
import { TOUR_STEPS } from './tour-steps';
import { useUIStore } from '../../store';

/**
 * First-run spotlight tour over the real UI regions. Dismissible at any step via
 * the Skip button or Esc; finishing or skipping marks the tour complete (persisted)
 * so it never auto-replays. Replayable from the Header Help menu.
 */
export const ProductTour: React.FC = () => {
  const tourRunning = useUIStore((s) => s.tourRunning);
  const completeTour = useUIStore((s) => s.completeTour);

  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status } = data;
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        completeTour(); // sets hasCompletedTour = true AND tourRunning = false
      }
    },
    [completeTour]
  );

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={tourRunning}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose
      scrollToFirstStep
      callback={handleCallback}
      styles={{ options: { zIndex: 10000, primaryColor: '#3b82f6' } }}
      locale={{ last: 'Done', skip: 'Skip tour' }}
    />
  );
};
