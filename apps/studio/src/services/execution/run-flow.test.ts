/**
 * runFlow: a refused run is reported, a run that started and failed is not reported twice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Flow } from '@accumulate-studio/types';

vi.mock('./index', () => ({ executionEngine: { executeFlow: vi.fn() } }));

import { executionEngine } from './index';
import { useFlowStore } from '../../store';
import { runFlow } from './run-flow';

const flow = { version: '1.0', name: 'Run flow test', network: 'kermit', variables: [], nodes: [], connections: [], assertions: [] } as unknown as Flow;
const executeFlow = executionEngine.executeFlow as unknown as ReturnType<typeof vi.fn>;

describe('runFlow', () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockReset();
    executeFlow.mockReset();
    useFlowStore.getState().resetExecution();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('passes the flow and the entered variables to the engine and stays quiet on success', async () => {
    executeFlow.mockResolvedValue(undefined);
    await runFlow(flow, { ADI_NAME: 'htlc-1' }, notify);
    expect(executeFlow).toHaveBeenCalledWith(flow, { ADI_NAME: 'htlc-1' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('tells the user when the engine refuses before the run starts (the dialog has already closed)', async () => {
    executeFlow.mockRejectedValue(new Error('Cannot run: a flow variable needs a value: ADI_NAME (Required)'));
    await runFlow(flow, {}, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: 'error',
      title: 'Cannot run the flow',
      description: expect.stringContaining('ADI_NAME (Required)'),
    });
  });

  it('does not toast a run that started and then failed: the log and App already report it', async () => {
    executeFlow.mockImplementation(async () => {
      useFlowStore.getState().startExecution();
      throw new Error('node failed');
    });
    await runFlow(flow, {}, notify);
    expect(notify).not.toHaveBeenCalled();
  });

  it('still reports a refusal when an OLDER run is on screen', async () => {
    useFlowStore.getState().startExecution();
    await new Promise((r) => setTimeout(r, 5));
    executeFlow.mockRejectedValue(new Error('Not connected to any network'));
    await runFlow(flow, {}, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].description).toBe('Not connected to any network');
  });
});
