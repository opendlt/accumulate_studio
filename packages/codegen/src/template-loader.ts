/**
 * Template Loader - Load .hbs templates as strings
 *
 * Bundles all Handlebars templates for each language at build time.
 * Templates are keyed by operation name (e.g., "generate_keys", "_preamble").
 */

import type { SDKLanguage } from '@accumulate-studio/types';

// =============================================================================
// Bundled Python Templates
// =============================================================================

import pythonPreamble from './templates/python/_preamble.hbs?raw';
import pythonEpilogue from './templates/python/_epilogue.hbs?raw';
import pythonFallback from './templates/python/_fallback.hbs?raw';
import pythonGenerateKeys from './templates/python/generate_keys.hbs?raw';
import pythonFaucet from './templates/python/faucet.hbs?raw';
import pythonWaitForBalance from './templates/python/wait_for_balance.hbs?raw';
import pythonWaitForCredits from './templates/python/wait_for_credits.hbs?raw';
import pythonAddCredits from './templates/python/add_credits.hbs?raw';
import pythonCreateIdentity from './templates/python/create_identity.hbs?raw';
import pythonCreateKeyBook from './templates/python/create_key_book.hbs?raw';
import pythonCreateKeyPage from './templates/python/create_key_page.hbs?raw';
import pythonCreateTokenAccount from './templates/python/create_token_account.hbs?raw';
import pythonCreateDataAccount from './templates/python/create_data_account.hbs?raw';
import pythonCreateToken from './templates/python/create_token.hbs?raw';
import pythonSendTokens from './templates/python/send_tokens.hbs?raw';
import pythonIssueTokens from './templates/python/issue_tokens.hbs?raw';
import pythonBurnTokens from './templates/python/burn_tokens.hbs?raw';
import pythonWriteData from './templates/python/write_data.hbs?raw';
import pythonQueryAccount from './templates/python/query_account.hbs?raw';
import pythonComment from './templates/python/comment.hbs?raw';
import pythonUpdateKeyPage from './templates/python/update_key_page.hbs?raw';
import pythonCreateLiteTokenAccount from './templates/python/create_lite_token_account.hbs?raw';
import pythonTransferCredits from './templates/python/transfer_credits.hbs?raw';
import pythonBurnCredits from './templates/python/burn_credits.hbs?raw';
import pythonWriteDataTo from './templates/python/write_data_to.hbs?raw';
import pythonLockAccount from './templates/python/lock_account.hbs?raw';
import pythonUpdateAccountAuth from './templates/python/update_account_auth.hbs?raw';
import pythonUpdateKey from './templates/python/update_key.hbs?raw';

// =============================================================================
// Bundled Rust Templates
// =============================================================================

import rustPreamble from './templates/rust/_preamble.hbs?raw';
import rustEpilogue from './templates/rust/_epilogue.hbs?raw';
import rustFallback from './templates/rust/_fallback.hbs?raw';
import rustGenerateKeys from './templates/rust/generate_keys.hbs?raw';
import rustFaucet from './templates/rust/faucet.hbs?raw';
import rustWaitForBalance from './templates/rust/wait_for_balance.hbs?raw';
import rustWaitForCredits from './templates/rust/wait_for_credits.hbs?raw';
import rustAddCredits from './templates/rust/add_credits.hbs?raw';
import rustCreateIdentity from './templates/rust/create_identity.hbs?raw';
import rustCreateKeyBook from './templates/rust/create_key_book.hbs?raw';
import rustCreateKeyPage from './templates/rust/create_key_page.hbs?raw';
import rustCreateTokenAccount from './templates/rust/create_token_account.hbs?raw';
import rustCreateDataAccount from './templates/rust/create_data_account.hbs?raw';
import rustCreateToken from './templates/rust/create_token.hbs?raw';
import rustSendTokens from './templates/rust/send_tokens.hbs?raw';
import rustIssueTokens from './templates/rust/issue_tokens.hbs?raw';
import rustBurnTokens from './templates/rust/burn_tokens.hbs?raw';
import rustWriteData from './templates/rust/write_data.hbs?raw';
import rustQueryAccount from './templates/rust/query_account.hbs?raw';
import rustComment from './templates/rust/comment.hbs?raw';
import rustUpdateKeyPage from './templates/rust/update_key_page.hbs?raw';
import rustCreateLiteTokenAccount from './templates/rust/create_lite_token_account.hbs?raw';
import rustTransferCredits from './templates/rust/transfer_credits.hbs?raw';
import rustBurnCredits from './templates/rust/burn_credits.hbs?raw';
import rustWriteDataTo from './templates/rust/write_data_to.hbs?raw';
import rustLockAccount from './templates/rust/lock_account.hbs?raw';
import rustUpdateAccountAuth from './templates/rust/update_account_auth.hbs?raw';
import rustUpdateKey from './templates/rust/update_key.hbs?raw';

// =============================================================================
// Bundled Dart Templates
// =============================================================================

import dartPreamble from './templates/dart/_preamble.hbs?raw';
import dartEpilogue from './templates/dart/_epilogue.hbs?raw';
import dartFallback from './templates/dart/_fallback.hbs?raw';
import dartGenerateKeys from './templates/dart/generate_keys.hbs?raw';
import dartFaucet from './templates/dart/faucet.hbs?raw';
import dartWaitForBalance from './templates/dart/wait_for_balance.hbs?raw';
import dartWaitForCredits from './templates/dart/wait_for_credits.hbs?raw';
import dartAddCredits from './templates/dart/add_credits.hbs?raw';
import dartCreateIdentity from './templates/dart/create_identity.hbs?raw';
import dartCreateKeyBook from './templates/dart/create_key_book.hbs?raw';
import dartCreateKeyPage from './templates/dart/create_key_page.hbs?raw';
import dartCreateTokenAccount from './templates/dart/create_token_account.hbs?raw';
import dartCreateDataAccount from './templates/dart/create_data_account.hbs?raw';
import dartCreateToken from './templates/dart/create_token.hbs?raw';
import dartSendTokens from './templates/dart/send_tokens.hbs?raw';
import dartIssueTokens from './templates/dart/issue_tokens.hbs?raw';
import dartBurnTokens from './templates/dart/burn_tokens.hbs?raw';
import dartWriteData from './templates/dart/write_data.hbs?raw';
import dartQueryAccount from './templates/dart/query_account.hbs?raw';
import dartComment from './templates/dart/comment.hbs?raw';
import dartUpdateKeyPage from './templates/dart/update_key_page.hbs?raw';
import dartCreateLiteTokenAccount from './templates/dart/create_lite_token_account.hbs?raw';
import dartTransferCredits from './templates/dart/transfer_credits.hbs?raw';
import dartBurnCredits from './templates/dart/burn_credits.hbs?raw';
import dartWriteDataTo from './templates/dart/write_data_to.hbs?raw';
import dartLockAccount from './templates/dart/lock_account.hbs?raw';
import dartUpdateAccountAuth from './templates/dart/update_account_auth.hbs?raw';
import dartUpdateKey from './templates/dart/update_key.hbs?raw';

// =============================================================================
// Bundled C# Templates
// =============================================================================

import csharpPreamble from './templates/csharp/_preamble.hbs?raw';
import csharpEpilogue from './templates/csharp/_epilogue.hbs?raw';
import csharpFallback from './templates/csharp/_fallback.hbs?raw';
import csharpGenerateKeys from './templates/csharp/generate_keys.hbs?raw';
import csharpFaucet from './templates/csharp/faucet.hbs?raw';
import csharpWaitForBalance from './templates/csharp/wait_for_balance.hbs?raw';
import csharpWaitForCredits from './templates/csharp/wait_for_credits.hbs?raw';
import csharpAddCredits from './templates/csharp/add_credits.hbs?raw';
import csharpCreateIdentity from './templates/csharp/create_identity.hbs?raw';
import csharpCreateKeyBook from './templates/csharp/create_key_book.hbs?raw';
import csharpCreateKeyPage from './templates/csharp/create_key_page.hbs?raw';
import csharpCreateTokenAccount from './templates/csharp/create_token_account.hbs?raw';
import csharpCreateDataAccount from './templates/csharp/create_data_account.hbs?raw';
import csharpCreateToken from './templates/csharp/create_token.hbs?raw';
import csharpSendTokens from './templates/csharp/send_tokens.hbs?raw';
import csharpIssueTokens from './templates/csharp/issue_tokens.hbs?raw';
import csharpBurnTokens from './templates/csharp/burn_tokens.hbs?raw';
import csharpWriteData from './templates/csharp/write_data.hbs?raw';
import csharpQueryAccount from './templates/csharp/query_account.hbs?raw';
import csharpComment from './templates/csharp/comment.hbs?raw';
import csharpUpdateKeyPage from './templates/csharp/update_key_page.hbs?raw';
import csharpCreateLiteTokenAccount from './templates/csharp/create_lite_token_account.hbs?raw';
import csharpTransferCredits from './templates/csharp/transfer_credits.hbs?raw';
import csharpBurnCredits from './templates/csharp/burn_credits.hbs?raw';
import csharpWriteDataTo from './templates/csharp/write_data_to.hbs?raw';
import csharpLockAccount from './templates/csharp/lock_account.hbs?raw';
import csharpUpdateAccountAuth from './templates/csharp/update_account_auth.hbs?raw';
import csharpUpdateKey from './templates/csharp/update_key.hbs?raw';

// =============================================================================
// Bundled JavaScript Templates
// =============================================================================

import jsPreamble from './templates/javascript/_preamble.hbs?raw';
import jsEpilogue from './templates/javascript/_epilogue.hbs?raw';
import jsFallback from './templates/javascript/_fallback.hbs?raw';
import jsGenerateKeys from './templates/javascript/generate_keys.hbs?raw';
import jsFaucet from './templates/javascript/faucet.hbs?raw';
import jsWaitForBalance from './templates/javascript/wait_for_balance.hbs?raw';
import jsWaitForCredits from './templates/javascript/wait_for_credits.hbs?raw';
import jsAddCredits from './templates/javascript/add_credits.hbs?raw';
import jsCreateIdentity from './templates/javascript/create_identity.hbs?raw';
import jsCreateKeyBook from './templates/javascript/create_key_book.hbs?raw';
import jsCreateKeyPage from './templates/javascript/create_key_page.hbs?raw';
import jsCreateTokenAccount from './templates/javascript/create_token_account.hbs?raw';
import jsCreateDataAccount from './templates/javascript/create_data_account.hbs?raw';
import jsCreateToken from './templates/javascript/create_token.hbs?raw';
import jsSendTokens from './templates/javascript/send_tokens.hbs?raw';
import jsIssueTokens from './templates/javascript/issue_tokens.hbs?raw';
import jsBurnTokens from './templates/javascript/burn_tokens.hbs?raw';
import jsWriteData from './templates/javascript/write_data.hbs?raw';
import jsQueryAccount from './templates/javascript/query_account.hbs?raw';
import jsComment from './templates/javascript/comment.hbs?raw';
import jsUpdateKeyPage from './templates/javascript/update_key_page.hbs?raw';
import jsCreateLiteTokenAccount from './templates/javascript/create_lite_token_account.hbs?raw';
import jsTransferCredits from './templates/javascript/transfer_credits.hbs?raw';
import jsBurnCredits from './templates/javascript/burn_credits.hbs?raw';
import jsWriteDataTo from './templates/javascript/write_data_to.hbs?raw';
import jsLockAccount from './templates/javascript/lock_account.hbs?raw';
import jsUpdateAccountAuth from './templates/javascript/update_account_auth.hbs?raw';
import jsUpdateKey from './templates/javascript/update_key.hbs?raw';

// =============================================================================
// Template Maps
// =============================================================================

function buildTemplateMap(...pairs: [string, string][]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, value] of pairs) {
    map[key] = value;
  }
  return map;
}

const PYTHON_TEMPLATES = buildTemplateMap(
  ['_preamble', pythonPreamble],
  ['_epilogue', pythonEpilogue],
  ['_fallback', pythonFallback],
  ['generate_keys', pythonGenerateKeys],
  ['faucet', pythonFaucet],
  ['wait_for_balance', pythonWaitForBalance],
  ['wait_for_credits', pythonWaitForCredits],
  ['add_credits', pythonAddCredits],
  ['create_identity', pythonCreateIdentity],
  ['create_key_book', pythonCreateKeyBook],
  ['create_key_page', pythonCreateKeyPage],
  ['create_token_account', pythonCreateTokenAccount],
  ['create_data_account', pythonCreateDataAccount],
  ['create_token', pythonCreateToken],
  ['send_tokens', pythonSendTokens],
  ['issue_tokens', pythonIssueTokens],
  ['burn_tokens', pythonBurnTokens],
  ['write_data', pythonWriteData],
  ['query_account', pythonQueryAccount],
  ['comment', pythonComment],
  ['update_key_page', pythonUpdateKeyPage],
  ['create_lite_token_account', pythonCreateLiteTokenAccount],
  ['transfer_credits', pythonTransferCredits],
  ['burn_credits', pythonBurnCredits],
  ['write_data_to', pythonWriteDataTo],
  ['lock_account', pythonLockAccount],
  ['update_account_auth', pythonUpdateAccountAuth],
  ['update_key', pythonUpdateKey],
);

const RUST_TEMPLATES = buildTemplateMap(
  ['_preamble', rustPreamble],
  ['_epilogue', rustEpilogue],
  ['_fallback', rustFallback],
  ['generate_keys', rustGenerateKeys],
  ['faucet', rustFaucet],
  ['wait_for_balance', rustWaitForBalance],
  ['wait_for_credits', rustWaitForCredits],
  ['add_credits', rustAddCredits],
  ['create_identity', rustCreateIdentity],
  ['create_key_book', rustCreateKeyBook],
  ['create_key_page', rustCreateKeyPage],
  ['create_token_account', rustCreateTokenAccount],
  ['create_data_account', rustCreateDataAccount],
  ['create_token', rustCreateToken],
  ['send_tokens', rustSendTokens],
  ['issue_tokens', rustIssueTokens],
  ['burn_tokens', rustBurnTokens],
  ['write_data', rustWriteData],
  ['query_account', rustQueryAccount],
  ['comment', rustComment],
  ['update_key_page', rustUpdateKeyPage],
  ['create_lite_token_account', rustCreateLiteTokenAccount],
  ['transfer_credits', rustTransferCredits],
  ['burn_credits', rustBurnCredits],
  ['write_data_to', rustWriteDataTo],
  ['lock_account', rustLockAccount],
  ['update_account_auth', rustUpdateAccountAuth],
  ['update_key', rustUpdateKey],
);

const DART_TEMPLATES = buildTemplateMap(
  ['_preamble', dartPreamble],
  ['_epilogue', dartEpilogue],
  ['_fallback', dartFallback],
  ['generate_keys', dartGenerateKeys],
  ['faucet', dartFaucet],
  ['wait_for_balance', dartWaitForBalance],
  ['wait_for_credits', dartWaitForCredits],
  ['add_credits', dartAddCredits],
  ['create_identity', dartCreateIdentity],
  ['create_key_book', dartCreateKeyBook],
  ['create_key_page', dartCreateKeyPage],
  ['create_token_account', dartCreateTokenAccount],
  ['create_data_account', dartCreateDataAccount],
  ['create_token', dartCreateToken],
  ['send_tokens', dartSendTokens],
  ['issue_tokens', dartIssueTokens],
  ['burn_tokens', dartBurnTokens],
  ['write_data', dartWriteData],
  ['query_account', dartQueryAccount],
  ['comment', dartComment],
  ['update_key_page', dartUpdateKeyPage],
  ['create_lite_token_account', dartCreateLiteTokenAccount],
  ['transfer_credits', dartTransferCredits],
  ['burn_credits', dartBurnCredits],
  ['write_data_to', dartWriteDataTo],
  ['lock_account', dartLockAccount],
  ['update_account_auth', dartUpdateAccountAuth],
  ['update_key', dartUpdateKey],
);

const CSHARP_TEMPLATES = buildTemplateMap(
  ['_preamble', csharpPreamble],
  ['_epilogue', csharpEpilogue],
  ['_fallback', csharpFallback],
  ['generate_keys', csharpGenerateKeys],
  ['faucet', csharpFaucet],
  ['wait_for_balance', csharpWaitForBalance],
  ['wait_for_credits', csharpWaitForCredits],
  ['add_credits', csharpAddCredits],
  ['create_identity', csharpCreateIdentity],
  ['create_key_book', csharpCreateKeyBook],
  ['create_key_page', csharpCreateKeyPage],
  ['create_token_account', csharpCreateTokenAccount],
  ['create_data_account', csharpCreateDataAccount],
  ['create_token', csharpCreateToken],
  ['send_tokens', csharpSendTokens],
  ['issue_tokens', csharpIssueTokens],
  ['burn_tokens', csharpBurnTokens],
  ['write_data', csharpWriteData],
  ['query_account', csharpQueryAccount],
  ['comment', csharpComment],
  ['update_key_page', csharpUpdateKeyPage],
  ['create_lite_token_account', csharpCreateLiteTokenAccount],
  ['transfer_credits', csharpTransferCredits],
  ['burn_credits', csharpBurnCredits],
  ['write_data_to', csharpWriteDataTo],
  ['lock_account', csharpLockAccount],
  ['update_account_auth', csharpUpdateAccountAuth],
  ['update_key', csharpUpdateKey],
);

const JAVASCRIPT_TEMPLATES = buildTemplateMap(
  ['_preamble', jsPreamble],
  ['_epilogue', jsEpilogue],
  ['_fallback', jsFallback],
  ['generate_keys', jsGenerateKeys],
  ['faucet', jsFaucet],
  ['wait_for_balance', jsWaitForBalance],
  ['wait_for_credits', jsWaitForCredits],
  ['add_credits', jsAddCredits],
  ['create_identity', jsCreateIdentity],
  ['create_key_book', jsCreateKeyBook],
  ['create_key_page', jsCreateKeyPage],
  ['create_token_account', jsCreateTokenAccount],
  ['create_data_account', jsCreateDataAccount],
  ['create_token', jsCreateToken],
  ['send_tokens', jsSendTokens],
  ['issue_tokens', jsIssueTokens],
  ['burn_tokens', jsBurnTokens],
  ['write_data', jsWriteData],
  ['query_account', jsQueryAccount],
  ['comment', jsComment],
  ['update_key_page', jsUpdateKeyPage],
  ['create_lite_token_account', jsCreateLiteTokenAccount],
  ['transfer_credits', jsTransferCredits],
  ['burn_credits', jsBurnCredits],
  ['write_data_to', jsWriteDataTo],
  ['lock_account', jsLockAccount],
  ['update_account_auth', jsUpdateAccountAuth],
  ['update_key', jsUpdateKey],
);

const ALL_TEMPLATES: Partial<Record<SDKLanguage, Record<string, string>>> = {
  python: PYTHON_TEMPLATES,
  rust: RUST_TEMPLATES,
  dart: DART_TEMPLATES,
  csharp: CSHARP_TEMPLATES,
  javascript: JAVASCRIPT_TEMPLATES,
};

/**
 * Load bundled templates for a specific language
 */
export function loadBundledTemplates(language: SDKLanguage): Record<string, string> {
  return ALL_TEMPLATES[language] ?? {};
}
