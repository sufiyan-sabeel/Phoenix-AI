export enum PhoenixErrorCode {
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  PROVIDER_AUTH_FAILED = 'PROVIDER_AUTH_FAILED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  TOOL_PERMISSION_DENIED = 'TOOL_PERMISSION_DENIED',
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
  MCP_TIMEOUT = 'MCP_TIMEOUT',
  MCP_INVALID_RESPONSE = 'MCP_INVALID_RESPONSE',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_PERMISSION_DENIED = 'AUTH_PERMISSION_DENIED',
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',
  VALIDATION_INVALID_INPUT = 'VALIDATION_INVALID_INPUT',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_LIMIT_REACHED = 'SESSION_LIMIT_REACHED',
  MEMORY_ERROR = 'MEMORY_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class PhoenixError extends Error {
  public readonly code: PhoenixErrorCode;
  public readonly recoverable: boolean;
  public readonly cause?: Error;

  constructor(
    code: PhoenixErrorCode,
    message: string,
    recoverable: boolean = false,
    cause?: Error
  ) {
    super(message);
    this.name = 'PhoenixError';
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }
}

export class ProviderError extends PhoenixError {
  constructor(
    message: string,
    provider: string,
    recoverable: boolean = true,
    cause?: Error
  ) {
    super(PhoenixErrorCode.PROVIDER_ERROR, `[${provider}] ${message}`, recoverable, cause);
    this.name = 'ProviderError';
  }
}

export class ToolError extends PhoenixError {
  public readonly toolName: string;

  constructor(
    message: string,
    toolName: string,
    recoverable: boolean = false,
    cause?: Error
  ) {
    super(PhoenixErrorCode.TOOL_EXECUTION_FAILED, `[tool:${toolName}] ${message}`, recoverable, cause);
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

export class MCPError extends PhoenixError {
  public readonly serverName?: string;

  constructor(
    message: string,
    serverName?: string,
    recoverable: boolean = true,
    cause?: Error
  ) {
    const suffix = serverName ? ` [mcp:${serverName}]` : ' [mcp]';
    super(PhoenixErrorCode.MCP_CONNECTION_FAILED, `${suffix} ${message}`, recoverable, cause);
    this.name = 'MCPError';
    this.serverName = serverName;
  }
}

export class AuthError extends PhoenixError {
  constructor(
    message: string,
    recoverable: boolean = false,
    cause?: Error
  ) {
    super(PhoenixErrorCode.AUTH_INVALID_CREDENTIALS, message, recoverable, cause);
    this.name = 'AuthError';
  }
}

export class ConfigError extends PhoenixError {
  constructor(
    message: string,
    recoverable: boolean = false,
    cause?: Error
  ) {
    super(PhoenixErrorCode.CONFIG_INVALID, message, recoverable, cause);
    this.name = 'ConfigError';
  }
}

export class ValidationError extends PhoenixError {
  public readonly field?: string;

  constructor(
    message: string,
    field?: string,
    cause?: Error
  ) {
    super(PhoenixErrorCode.VALIDATION_INVALID_INPUT, message, false, cause);
    this.name = 'ValidationError';
    this.field = field;
  }
}
