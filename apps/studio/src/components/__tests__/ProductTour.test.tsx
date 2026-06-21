/**
 * ProductTour Tests (P3-1) — verifies the spotlight tour wiring without rendering
 * the real Joyride overlay (mocked to capture props + invoke its callback).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

let lastProps: any = null;
vi.mock('react-joyride', () => ({
  default: (props: any) => {
    lastProps = props;
    return null;
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

import { ProductTour } from '../onboarding/ProductTour';
import { TOUR_STEPS } from '../onboarding/tour-steps';
import { useUIStore } from '../../store';

describe('ProductTour', () => {
  beforeEach(() => {
    lastProps = null;
    useUIStore.setState({ tourRunning: false, hasCompletedTour: false });
  });

  it('runs Joyride with all 5 spotlight steps when tourRunning is true', () => {
    useUIStore.setState({ tourRunning: true });
    render(<ProductTour />);
    expect(lastProps.run).toBe(true);
    expect(lastProps.steps).toHaveLength(5);
    expect(lastProps.continuous).toBe(true);
    expect(lastProps.showSkipButton).toBe(true);
  });

  it('does not run when tourRunning is false', () => {
    render(<ProductTour />);
    expect(lastProps.run).toBe(false);
  });

  it('marks the tour complete (and stops it) when finished', () => {
    useUIStore.setState({ tourRunning: true });
    render(<ProductTour />);
    lastProps.callback({ status: 'finished' });
    expect(useUIStore.getState().hasCompletedTour).toBe(true);
    expect(useUIStore.getState().tourRunning).toBe(false);
  });

  it('marks the tour complete when skipped', () => {
    useUIStore.setState({ tourRunning: true });
    render(<ProductTour />);
    lastProps.callback({ status: 'skipped' });
    expect(useUIStore.getState().hasCompletedTour).toBe(true);
    expect(useUIStore.getState().tourRunning).toBe(false);
  });

  it('targets the real data-tour anchors in order', () => {
    expect(TOUR_STEPS.map((s) => s.target)).toEqual([
      '[data-tour="palette"]',
      '[data-tour="canvas"]',
      '[data-tour="code-panel"]',
      '[data-tour="network-selector"]',
      '[data-tour="execute"]',
    ]);
  });
});
