import type { Step } from 'react-joyride';

/** Spotlight steps for the first-run product tour. Targets are stable `data-tour` anchors. */
export const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="palette"]',
    title: 'Action Palette',
    content: 'Browse Accumulate operations and drag them onto the canvas to build a flow.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="canvas"]',
    title: 'Flow Canvas',
    content: 'Arrange and connect blocks here. Connections define the order your transactions run in.',
    placement: 'top',
  },
  {
    target: '[data-tour="code-panel"]',
    title: 'Generated Code',
    content: 'Your flow is compiled live into Python, Rust, Dart, JavaScript and C# SDK code.',
    placement: 'left',
  },
  {
    target: '[data-tour="network-selector"]',
    title: 'Network',
    content: 'Pick the network you target. Kermit is the safe default; Mainnet uses real ACME tokens.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="execute"]',
    title: 'Execute',
    content: 'When your flow is valid, run it end-to-end on the selected network and watch results stream in.',
    placement: 'bottom',
  },
];
