import { describe, it, expect, vi } from 'vitest';

vi.mock('@accumulate-studio/types', async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    BLOCK_CATALOG: {
      CreateIdentity: {
        configSchema: {
          properties: {
            url: { description: 'ADI URL' },
            pub: { description: 'auto-resolved key hash' },
          },
          required: ['url', 'pub'],
        },
      },
      SendTokens: {
        configSchema: {
          properties: { recipients: { description: 'list' } },
          required: ['recipients'],
        },
      },
    },
  };
});

import {
  getMissingRequiredFields,
  countNodesWithMissingFields,
  isAutoResolved,
} from '../config-validation';

describe('config-validation', () => {
  it('flags empty required, ignores auto-resolved', () => {
    expect(getMissingRequiredFields('CreateIdentity' as any, {})).toEqual(['url']);
  });

  it('passes when required filled', () => {
    expect(getMissingRequiredFields('CreateIdentity' as any, { url: 'acc://x.acme' })).toEqual([]);
  });

  it('treats whitespace-only string as empty', () => {
    expect(getMissingRequiredFields('CreateIdentity' as any, { url: '   ' })).toEqual(['url']);
  });

  it('treats empty array as missing', () => {
    expect(getMissingRequiredFields('SendTokens' as any, { recipients: [] })).toEqual(['recipients']);
    expect(getMissingRequiredFields('SendTokens' as any, { recipients: [{ url: 'x' }] })).toEqual([]);
  });

  it('returns [] for an unknown block type', () => {
    expect(getMissingRequiredFields('NotAReal' as any, {})).toEqual([]);
  });

  it('counts nodes with missing fields', () => {
    const flow: any = {
      nodes: [
        { type: 'CreateIdentity', config: {} },
        { type: 'CreateIdentity', config: { url: 'acc://ok.acme' } },
        { type: 'SendTokens', config: { recipients: [] } },
      ],
    };
    expect(countNodesWithMissingFields(flow)).toBe(2);
  });

  it('isAutoResolved detects opt-in descriptions', () => {
    expect(isAutoResolved('this is auto-resolved from upstream')).toBe(true);
    expect(isAutoResolved('auto-fetched value')).toBe(true);
    expect(isAutoResolved('a normal field')).toBe(false);
    expect(isAutoResolved(undefined)).toBe(false);
  });
});
