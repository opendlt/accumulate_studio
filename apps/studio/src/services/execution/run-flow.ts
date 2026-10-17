/**
 * Start a run from the Execute dialog and tell the user when it is refused.
 *
 * A run that starts and then fails is already in the execution log, and App toasts it. What the
 * engine throws BEFORE the run starts (a missing flow variable, no network, a run already in
 * progress, a network mismatch) leaves nothing on screen: the dialog has closed, so the click would
 * look like it did nothing. Those are reported here.
 */
import type { Flow } from '@accumulate-studio/types';
import { useFlowStore } from '../../store';
import type { VariableValues } from '../flow-variables';
import { executionEngine } from './index';

export interface RunFailureToast {
  type: 'error';
  title: string;
  description: string;
  duration: number;
}

export async function runFlow(
  flow: Flow,
  variables: VariableValues,
  notify: (toast: RunFailureToast) => void
): Promise<void> {
  const since = Date.now();
  try {
    await executionEngine.executeFlow(flow, variables);
  } catch (error) {
    console.error('Execution failed:', error);
    // The store records the moment a run begins; a start before this call belongs to an older run.
    const startedAt = useFlowStore.getState().execution?.startedAt;
    const started = startedAt !== undefined && Date.parse(startedAt) >= since;
    if (!started) {
      notify({
        type: 'error',
        title: 'Cannot run the flow',
        description: error instanceof Error ? error.message : String(error),
        duration: 8000,
      });
    }
  }
}
