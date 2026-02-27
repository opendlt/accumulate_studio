/**
 * StateDiffViewer Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StateDiffViewer } from '../execution/StateDiffViewer';
import type { FlowExecutionState, AccountStateDiff } from '@accumulate-studio/types';

// =============================================================================
// Helpers
// =============================================================================

function makeExecState(
  diffs: AccountStateDiff[]
): FlowExecutionState {
  const nodeStates: Record<string, any> = {};
  diffs.forEach((diff, i) => {
    nodeStates[`node-${i}`] = {
      nodeId: `node-${i}`,
      status: 'success',
      outputs: { stateDiff: diff },
    };
  });

  return {
    flowId: 'test',
    status: 'completed',
    nodeStates,
    variables: {},
    logs: [],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('StateDiffViewer', () => {
  it('shows empty state when no execution data', () => {
    render(<StateDiffViewer executionState={null} />);
    expect(screen.getByText('No state changes yet.')).toBeDefined();
    expect(screen.getByText('Execute the flow to see account state changes.')).toBeDefined();
  });

  it('shows no changes message when execution has no diffs', () => {
    const executionState: FlowExecutionState = {
      flowId: 'test',
      status: 'completed',
      nodeStates: {
        'node-1': {
          nodeId: 'node-1',
          status: 'success',
          outputs: {},
        },
      },
      variables: {},
      logs: [],
    };
    render(<StateDiffViewer executionState={executionState} />);
    expect(screen.getByText('No state changes detected.')).toBeDefined();
  });

  it('renders account diff cards', () => {
    const diff: AccountStateDiff = {
      url: 'acc://my-adi.acme/tokens',
      accountType: 'tokenAccount',
      before: null,
      after: { balance: '1000000000' },
      changes: [
        { path: 'balance', type: 'added', after: '1000000000' },
      ],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);
    expect(screen.getByText('acc://my-adi.acme/tokens')).toBeDefined();
    expect(screen.getByText('tokenAccount')).toBeDefined();
  });

  it('shows account count summary', () => {
    const diff1: AccountStateDiff = {
      url: 'acc://one.acme',
      accountType: 'adi',
      before: null,
      after: {},
      changes: [],
    };
    const diff2: AccountStateDiff = {
      url: 'acc://two.acme',
      accountType: 'tokenAccount',
      before: null,
      after: {},
      changes: [],
    };
    render(<StateDiffViewer executionState={makeExecState([diff1, diff2])} />);
    expect(screen.getByText('2 accounts modified')).toBeDefined();
  });

  it('shows "1 account modified" for single account', () => {
    const diff: AccountStateDiff = {
      url: 'acc://one.acme',
      accountType: 'adi',
      before: null,
      after: {},
      changes: [{ path: 'url', type: 'added', after: 'acc://one.acme' }],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);
    expect(screen.getByText('1 account modified')).toBeDefined();
  });

  it('shows "New Account" badge for accounts with null before', () => {
    const diff: AccountStateDiff = {
      url: 'acc://new-adi.acme',
      accountType: 'adi',
      before: null,
      after: { url: 'acc://new-adi.acme' },
      changes: [{ path: 'url', type: 'added', after: 'acc://new-adi.acme' }],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);
    expect(screen.getByText('New Account')).toBeDefined();
  });

  it('renders diff lines with correct types', () => {
    const diff: AccountStateDiff = {
      url: 'acc://test.acme',
      accountType: 'tokenAccount',
      before: { balance: '500' },
      after: { balance: '1000', url: 'acc://test.acme' },
      changes: [
        { path: 'balance', type: 'changed', before: '500', after: '1000' },
        { path: 'url', type: 'added', after: 'acc://test.acme' },
      ],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);
    expect(screen.getByText('balance')).toBeDefined();
    expect(screen.getByText('changed')).toBeDefined();
    expect(screen.getByText('added')).toBeDefined();
  });

  it('shows before/after values for changed entries', () => {
    const diff: AccountStateDiff = {
      url: 'acc://test.acme',
      accountType: 'tokenAccount',
      before: { balance: '500' },
      after: { balance: '1000' },
      changes: [
        { path: 'balance', type: 'changed', before: '500', after: '1000' },
      ],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);
    expect(screen.getByText('Before:')).toBeDefined();
    expect(screen.getByText('After:')).toBeDefined();
    expect(screen.getByText('500')).toBeDefined();
    expect(screen.getByText('1000')).toBeDefined();
  });

  it('shows Diff View and JSON toggle buttons', () => {
    const diff: AccountStateDiff = {
      url: 'acc://test.acme',
      accountType: 'adi',
      before: null,
      after: { url: 'acc://test.acme' },
      changes: [{ path: 'url', type: 'added', after: 'acc://test.acme' }],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);
    expect(screen.getByText('Diff View')).toBeDefined();
    expect(screen.getByText('JSON')).toBeDefined();
  });

  it('switches to JSON view when clicking JSON button', () => {
    const diff: AccountStateDiff = {
      url: 'acc://test.acme',
      accountType: 'adi',
      before: { old: true },
      after: { new: true },
      changes: [{ path: 'old', type: 'removed', before: true }],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);

    // Click JSON button
    fireEvent.click(screen.getByText('JSON'));

    // Should show raw Before/After JSON panels
    // The "Before" label in the JSON view
    const beforeLabels = screen.getAllByText('Before');
    expect(beforeLabels.length).toBeGreaterThan(0);
  });

  it('collapses account card when header is clicked', () => {
    const diff: AccountStateDiff = {
      url: 'acc://collapse-test.acme',
      accountType: 'adi',
      before: { existed: true },
      after: { existed: true, newField: 'val' },
      changes: [{ path: 'newField', type: 'added', after: 'val' }],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);

    // The diff view should be visible initially (expanded=true by default)
    expect(screen.getByText('Diff View')).toBeDefined();

    // Click the account header to collapse (use the URL in the <p> tag)
    fireEvent.click(screen.getByText('acc://collapse-test.acme'));

    // After collapsing, the Diff View button should not be visible
    expect(screen.queryByText('Diff View')).toBeNull();
  });

  it('shows "No changes detected" for empty changes array', () => {
    const diff: AccountStateDiff = {
      url: 'acc://empty.acme',
      accountType: 'adi',
      before: {},
      after: {},
      changes: [],
    };
    render(<StateDiffViewer executionState={makeExecState([diff])} />);
    expect(screen.getByText('No changes detected')).toBeDefined();
  });

  it('extracts diffs from stateDiffs array output', () => {
    // Test the extraction of stateDiffs (array) from node outputs
    const execState: FlowExecutionState = {
      flowId: 'test',
      status: 'completed',
      nodeStates: {
        'node-0': {
          nodeId: 'node-0',
          status: 'success',
          outputs: {
            stateDiffs: [
              {
                url: 'acc://batch1.acme',
                accountType: 'adi',
                before: null,
                after: {},
                changes: [{ path: 'url', type: 'added', after: 'acc://batch1.acme' }],
              },
              {
                url: 'acc://batch2.acme',
                accountType: 'tokenAccount',
                before: null,
                after: {},
                changes: [{ path: 'balance', type: 'added', after: '0' }],
              },
            ],
          },
        },
      },
      variables: {},
      logs: [],
    };
    render(<StateDiffViewer executionState={execState} />);
    expect(screen.getByText('2 accounts modified')).toBeDefined();
    // URLs may appear in multiple places (header + diff line), use getAllByText
    expect(screen.getAllByText('acc://batch1.acme').length).toBeGreaterThan(0);
    expect(screen.getAllByText('acc://batch2.acme').length).toBeGreaterThan(0);
  });

  it('shows change count stats in header', () => {
    const diff: AccountStateDiff = {
      url: 'acc://test.acme',
      accountType: 'tokenAccount',
      before: { balance: '500' },
      after: { balance: '1000', url: 'acc://test.acme' },
      changes: [
        { path: 'balance', type: 'changed', before: '500', after: '1000' },
        { path: 'url', type: 'added', after: 'acc://test.acme' },
      ],
    };
    const { container } = render(
      <StateDiffViewer executionState={makeExecState([diff])} />
    );
    // Should show stats in the card header (1 added, 1 changed)
    // The stats show as numbers next to icons
    const statTexts = container.querySelectorAll('.text-xs');
    expect(statTexts.length).toBeGreaterThan(0);
  });
});
