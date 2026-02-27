/**
 * MCP Server Permissions
 * Controls what operations are allowed based on permission mode
 */

// =============================================================================
// Permission Modes
// =============================================================================

/**
 * Permission modes control what operations the MCP server can perform
 */
export enum PermissionMode {
  /** Read-only: Can query accounts and view data, but cannot build or submit transactions */
  READ_ONLY = 'READ_ONLY',

  /** Build-only: Can query and build transactions, but cannot sign or submit */
  BUILD_ONLY = 'BUILD_ONLY',

  /** Sign and submit: Full access to all operations */
  SIGN_AND_SUBMIT = 'SIGN_AND_SUBMIT',
}

// =============================================================================
// Permission Levels
// =============================================================================

/**
 * Operation categories that require different permission levels
 */
export enum OperationCategory {
  /** Reading data from the network */
  READ = 'READ',

  /** Building transaction bodies */
  BUILD = 'BUILD',

  /** Estimating costs */
  ESTIMATE = 'ESTIMATE',

  /** Validating prerequisites */
  VALIDATE = 'VALIDATE',

  /** Submitting transactions to the network */
  SUBMIT = 'SUBMIT',

  /** Waiting for transaction confirmation */
  WAIT = 'WAIT',
}

// =============================================================================
// Permission Matrix
// =============================================================================

/**
 * Maps permission modes to allowed operation categories
 */
const PERMISSION_MATRIX: Record<PermissionMode, Set<OperationCategory>> = {
  [PermissionMode.READ_ONLY]: new Set([
    OperationCategory.READ,
  ]),

  [PermissionMode.BUILD_ONLY]: new Set([
    OperationCategory.READ,
    OperationCategory.BUILD,
    OperationCategory.ESTIMATE,
    OperationCategory.VALIDATE,
  ]),

  [PermissionMode.SIGN_AND_SUBMIT]: new Set([
    OperationCategory.READ,
    OperationCategory.BUILD,
    OperationCategory.ESTIMATE,
    OperationCategory.VALIDATE,
    OperationCategory.SUBMIT,
    OperationCategory.WAIT,
  ]),
};

// =============================================================================
// Permission Checker
// =============================================================================

/**
 * Current permission state
 */
let currentPermissionMode: PermissionMode = PermissionMode.BUILD_ONLY;

/**
 * Get the current permission mode
 */
export function getPermissionMode(): PermissionMode {
  return currentPermissionMode;
}

/**
 * Set the permission mode
 */
export function setPermissionMode(mode: PermissionMode): void {
  currentPermissionMode = mode;
}

/**
 * Check if an operation category is allowed under the current permission mode
 */
export function isOperationAllowed(category: OperationCategory): boolean {
  return PERMISSION_MATRIX[currentPermissionMode].has(category);
}

/**
 * Check permissions and throw if not allowed
 */
export function requirePermission(category: OperationCategory): void {
  if (!isOperationAllowed(category)) {
    throw new PermissionError(
      `Operation category '${category}' is not allowed in '${currentPermissionMode}' mode`
    );
  }
}

/**
 * Get all allowed operation categories for the current permission mode
 */
export function getAllowedOperations(): OperationCategory[] {
  return Array.from(PERMISSION_MATRIX[currentPermissionMode]);
}

/**
 * Get a human-readable description of the current permission mode
 */
export function getPermissionModeDescription(mode: PermissionMode = currentPermissionMode): string {
  switch (mode) {
    case PermissionMode.READ_ONLY:
      return 'Read-only mode: Can query accounts and view data only';
    case PermissionMode.BUILD_ONLY:
      return 'Build-only mode: Can query, build, and estimate transactions but not submit';
    case PermissionMode.SIGN_AND_SUBMIT:
      return 'Full access mode: Can perform all operations including signing and submitting';
  }
}

// =============================================================================
// Permission Error
// =============================================================================

/**
 * Error thrown when an operation is not permitted
 */
export class PermissionError extends Error {
  readonly code = 'PERMISSION_DENIED';
  readonly category?: OperationCategory;
  readonly requiredMode?: PermissionMode;

  constructor(
    message: string,
    category?: OperationCategory,
    requiredMode?: PermissionMode
  ) {
    super(message);
    this.name = 'PermissionError';
    this.category = category;
    this.requiredMode = requiredMode;
  }
}

// =============================================================================
// Tool Permission Decorator
// =============================================================================

/**
 * Tool execution context with permission checking
 */
export interface ToolContext {
  permissionMode: PermissionMode;
  networkId?: string;
}

/**
 * Create a permission-checked tool handler
 */
export function withPermissionCheck<TArgs, TResult>(
  category: OperationCategory,
  handler: (args: TArgs, context: ToolContext) => Promise<TResult>
): (args: TArgs, context: ToolContext) => Promise<TResult> {
  return async (args: TArgs, context: ToolContext) => {
    // Check permission before executing
    if (!PERMISSION_MATRIX[context.permissionMode].has(category)) {
      throw new PermissionError(
        `Operation requires '${category}' permission which is not available in '${context.permissionMode}' mode`,
        category
      );
    }

    return handler(args, context);
  };
}

// =============================================================================
// Response Envelope
// =============================================================================

/**
 * Standard response envelope for all MCP tools
 */
export interface ToolResponse<T = unknown> {
  /** Whether the operation succeeded */
  ok: boolean;

  /** The effective permission mode when this was executed */
  permissions_effective: PermissionMode;

  /** The result data (if ok is true) */
  data?: T;

  /** Non-fatal warnings */
  warnings?: string[];

  /** Error details (if ok is false) */
  errors?: ToolError[];
}

/**
 * Error detail in the response envelope
 */
export interface ToolError {
  /** Error code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Create a successful response envelope
 */
export function successResponse<T>(data: T, warnings?: string[]): ToolResponse<T> {
  return {
    ok: true,
    permissions_effective: currentPermissionMode,
    data,
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Create an error response envelope
 */
export function errorResponse(errors: ToolError[], warnings?: string[]): ToolResponse {
  return {
    ok: false,
    permissions_effective: currentPermissionMode,
    errors,
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Create an error response from an exception
 */
export function errorFromException(error: unknown): ToolResponse {
  if (error instanceof PermissionError) {
    return errorResponse([
      {
        code: error.code,
        message: error.message,
        details: {
          category: error.category,
          requiredMode: error.requiredMode,
        },
      },
    ]);
  }

  if (error instanceof Error) {
    return errorResponse([
      {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    ]);
  }

  return errorResponse([
    {
      code: 'UNKNOWN_ERROR',
      message: String(error),
    },
  ]);
}
