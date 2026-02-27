#!/usr/bin/env node
/**
 * Accumulate Studio MCP Server
 * Model Context Protocol server for Accumulate blockchain operations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import {
  allTools,
  toolsByName,
  // Network tools
  netList,
  netSelect,
  netStatus,
  // Query tools
  accQuery,
  accGetChain,
  accGetBalance,
  // Transaction tools
  txBuild,
  txEstimateCredits,
  txValidatePrereqs,
  txSubmit,
  txWait,
  // Verification tools
  proofGetReceipt,
  proofVerifyReceipt,
  traceSynthetics,
} from './tools/index.js';

import {
  PermissionMode,
  setPermissionMode,
  getPermissionMode,
  getPermissionModeDescription,
  errorFromException,
} from './permissions.js';

// =============================================================================
// Server Configuration
// =============================================================================

const SERVER_NAME = 'accumulate-studio-mcp';
const SERVER_VERSION = '1.0.0';

// =============================================================================
// Tool Handler Registry
// =============================================================================

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const toolHandlers: Record<string, ToolHandler> = {
  // Network tools
  'net.list': netList as ToolHandler,
  'net.select': netSelect as ToolHandler,
  'net.status': netStatus as ToolHandler,

  // Query tools
  'acc.query': accQuery as ToolHandler,
  'acc.get_chain': accGetChain as ToolHandler,
  'acc.get_balance': accGetBalance as ToolHandler,

  // Transaction tools
  'tx.build': txBuild as ToolHandler,
  'tx.estimate_credits': txEstimateCredits as ToolHandler,
  'tx.validate_prereqs': txValidatePrereqs as ToolHandler,
  'tx.submit': txSubmit as ToolHandler,
  'tx.wait': txWait as ToolHandler,

  // Verification tools
  'proof.get_receipt': proofGetReceipt as ToolHandler,
  'proof.verify_receipt': proofVerifyReceipt as ToolHandler,
  'trace.synthetics': traceSynthetics as ToolHandler,
};

// =============================================================================
// Server Setup
// =============================================================================

/**
 * Create and configure the MCP server
 */
function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check if tool exists
    const handler = toolHandlers[name];
    if (!handler) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}. Available tools: ${Object.keys(toolHandlers).join(', ')}`
      );
    }

    try {
      // Execute the tool
      const result = await handler(args ?? {});

      // Format the response
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      // Convert errors to MCP format
      const errorResponse = errorFromException(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(): { permissionMode: PermissionMode } {
  const args = process.argv.slice(2);
  let permissionMode = PermissionMode.BUILD_ONLY;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--permission-mode' || arg === '-p') {
      const mode = args[++i]?.toUpperCase();
      if (mode === 'READ_ONLY' || mode === 'READ-ONLY') {
        permissionMode = PermissionMode.READ_ONLY;
      } else if (mode === 'BUILD_ONLY' || mode === 'BUILD-ONLY') {
        permissionMode = PermissionMode.BUILD_ONLY;
      } else if (mode === 'SIGN_AND_SUBMIT' || mode === 'SIGN-AND-SUBMIT') {
        permissionMode = PermissionMode.SIGN_AND_SUBMIT;
      } else {
        console.error(`Unknown permission mode: ${mode}`);
        console.error('Valid modes: READ_ONLY, BUILD_ONLY, SIGN_AND_SUBMIT');
        process.exit(1);
      }
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(`${SERVER_NAME} v${SERVER_VERSION}`);
      process.exit(0);
    }
  }

  return { permissionMode };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
${SERVER_NAME} v${SERVER_VERSION}
Accumulate Protocol MCP Server for AI assistants

USAGE:
  accumulate-studio-mcp [OPTIONS]

OPTIONS:
  -p, --permission-mode <MODE>  Set permission mode (default: BUILD_ONLY)
                                Modes: READ_ONLY, BUILD_ONLY, SIGN_AND_SUBMIT
  -h, --help                    Show this help message
  -v, --version                 Show version

PERMISSION MODES:
  READ_ONLY       Can query accounts and view data only
  BUILD_ONLY      Can query, build, and estimate transactions (default)
  SIGN_AND_SUBMIT Full access including signing and submitting transactions

AVAILABLE TOOLS:
  Network:
    net.list           List available networks
    net.select         Select and connect to a network
    net.status         Get network health status

  Query:
    acc.query          Query any Accumulate account
    acc.get_chain      Get chain entries from an account
    acc.get_balance    Get token balance for a token account

  Transaction:
    tx.build           Build a transaction body
    tx.estimate_credits Estimate credits required
    tx.validate_prereqs Validate prerequisites
    tx.submit          Submit a signed transaction
    tx.wait            Wait for transaction confirmation

  Verification:
    proof.get_receipt  Get Merkle receipt for a transaction
    proof.verify_receipt Verify a Merkle receipt
    trace.synthetics   Trace synthetic messages

EXAMPLES:
  # Start with default BUILD_ONLY mode
  accumulate-studio-mcp

  # Start in read-only mode
  accumulate-studio-mcp --permission-mode READ_ONLY

  # Start with full access
  accumulate-studio-mcp --permission-mode SIGN_AND_SUBMIT
`);
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Parse CLI arguments
  const { permissionMode } = parseArgs();

  // Set permission mode
  setPermissionMode(permissionMode);

  // Log startup info to stderr (stdout is for MCP communication)
  console.error(`Starting ${SERVER_NAME} v${SERVER_VERSION}`);
  console.error(`Permission mode: ${getPermissionMode()}`);
  console.error(getPermissionModeDescription());
  console.error(`Registered ${allTools.length} tools`);

  // Create server
  const server = createServer();

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  console.error('MCP server ready and listening on stdio');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('Received SIGINT, shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Received SIGTERM, shutting down...');
    await server.close();
    process.exit(0);
  });
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
