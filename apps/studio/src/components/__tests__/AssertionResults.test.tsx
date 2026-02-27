/**
 * AssertionResults Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssertionResults } from '../execution/AssertionResults';
import type { AssertionResult } from '../../services/assertion-runner';

describe('AssertionResults', () => {
  it('shows placeholder when results are null', () => {
    render(<AssertionResults results={null} />);
    expect(screen.getByText('Assertions will run after execution completes.')).toBeDefined();
  });

  it('shows empty message when no assertions defined', () => {
    render(<AssertionResults results={[]} />);
    expect(screen.getByText('No assertions defined for this flow.')).toBeDefined();
  });

  it('shows loading state when running', () => {
    render(<AssertionResults results={null} isRunning={true} />);
    expect(screen.getByText('Running assertions...')).toBeDefined();
  });

  it('shows summary with pass counts', () => {
    const results: AssertionResult[] = [
      {
        assertion: { type: 'balance.gte', account: 'acc://test', equals: '100' },
        status: 'pass',
        actual: '1000',
        message: 'Balance 1000 >= 100',
      },
      {
        assertion: { type: 'account.exists', url: 'acc://test' },
        status: 'pass',
        message: 'Account acc://test exists',
      },
    ];

    render(<AssertionResults results={results} />);
    expect(screen.getByText('2 assertions')).toBeDefined();
    expect(screen.getByText('2 passed')).toBeDefined();
  });

  it('shows failed assertion details', () => {
    const results: AssertionResult[] = [
      {
        assertion: { type: 'tx.status.equals', sourceStep: 'node-1', status: 'success' },
        status: 'fail',
        actual: 'error',
        message: 'Expected status "success", got "error"',
      },
    ];

    render(<AssertionResults results={results} />);
    expect(screen.getByText('1 failed')).toBeDefined();
    expect(screen.getByText('tx.status.equals')).toBeDefined();
    expect(screen.getByText('Fail')).toBeDefined();
    expect(screen.getByText('Expected status "success", got "error"')).toBeDefined();
  });

  it('shows mixed results', () => {
    const results: AssertionResult[] = [
      {
        assertion: { type: 'balance.gte', account: 'acc://test', equals: '100' },
        status: 'pass',
        message: 'Balance OK',
      },
      {
        assertion: { type: 'account.exists', url: 'acc://missing' },
        status: 'fail',
        message: 'Account not found',
      },
      {
        assertion: { type: 'balance.delta', account: 'acc://test', delta: '10' },
        status: 'skip',
        message: 'Not implemented',
      },
      {
        assertion: { type: 'receipt.verified', sourceStep: 'node-1' },
        status: 'error',
        message: 'Query failed',
      },
    ];

    render(<AssertionResults results={results} />);
    expect(screen.getByText('4 assertions')).toBeDefined();
    expect(screen.getByText('1 passed')).toBeDefined();
    expect(screen.getByText('1 failed')).toBeDefined();
    expect(screen.getByText('1 error')).toBeDefined();
    expect(screen.getByText('1 skipped')).toBeDefined();
  });

  it('shows assertion type badges', () => {
    const results: AssertionResult[] = [
      {
        assertion: { type: 'balance.gte', account: 'acc://test', equals: '100' },
        status: 'pass',
        message: 'OK',
      },
    ];

    render(<AssertionResults results={results} />);
    expect(screen.getByText('balance.gte')).toBeDefined();
  });

  it('shows actual value when provided', () => {
    const results: AssertionResult[] = [
      {
        assertion: { type: 'balance.gte', account: 'acc://test', equals: '100' },
        status: 'pass',
        actual: '5000',
        message: 'Balance 5000 >= 100',
      },
    ];

    render(<AssertionResults results={results} />);
    expect(screen.getByText('5000')).toBeDefined();
  });

  it('shows custom assertion message', () => {
    const results: AssertionResult[] = [
      {
        assertion: {
          type: 'account.exists',
          url: 'acc://test',
          message: 'The test account should exist after creation',
        },
        status: 'pass',
        message: 'Account exists',
      },
    ];

    render(<AssertionResults results={results} />);
    expect(screen.getByText('The test account should exist after creation')).toBeDefined();
  });
});
