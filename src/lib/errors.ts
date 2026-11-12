/**
 * Application Error Hierarchy & Result Types
 *
 * Implements resilient error handling patterns across Luna:
 * - Structured AppError hierarchy with HTTP status codes and machine-readable error codes.
 * - Discriminated Result<T, E> types for explicit functional error propagation.
 * - Runtime type guards to distinguish expected domain errors from unhandled system faults.
 */

export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetails;
  readonly isAppError = true as const;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", details?: ErrorDetails) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized operation. Secret or credentials mismatch.", details?: ErrorDetails) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden operation. Access denied.", details?: ErrorDetails) {
    super(message, 403, "FORBIDDEN", details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.", details?: ErrorDetails) {
    super(message, 404, "NOT_FOUND", details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict in current resource state.", details?: ErrorDetails) {
    super(message, 409, "CONFLICT", details);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message = "Rate limit exceeded. Please slow down.", retryAfterSeconds = 5, details?: ErrorDetails) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", { ...details, retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InternalServerError extends AppError {
  constructor(message = "An unexpected server error occurred. Please try again.", details?: ErrorDetails) {
    super(message, 500, "INTERNAL_SERVER_ERROR", details);
  }
}

export class ApiClientError extends AppError {
  constructor(message: string, statusCode: number, code = "API_CLIENT_ERROR", details?: ErrorDetails) {
    super(message, statusCode, code, details);
  }
}

/**
 * Type guard for AppError instances across realms/packages.
 */
export function isAppError(err: unknown): err is AppError {
  return (
    err instanceof AppError ||
    (typeof err === "object" && err !== null && "isAppError" in err && (err as { isAppError: unknown }).isAppError === true)
  );
}

/**
 * Type guard for ApiClientError instances.
 */
export function isApiClientError(err: unknown): err is ApiClientError {
  return isAppError(err) && (err.code === "API_CLIENT_ERROR" || err.name === "ApiClientError");
}

// =============================================================================
// Result Type Pattern
// =============================================================================

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E };

export type AsyncResult<T, E = AppError> = Promise<Result<T, E>>;

export function ok<T>(data: T): Result<T, never> {
  return Object.freeze({ ok: true, data });
}

export function err<E>(error: E): Result<never, E> {
  return Object.freeze({ ok: false, error });
}

export function isOk<T, E>(result: Result<T, E>): result is { readonly ok: true; readonly data: T } {
  return result.ok === true;
}

export function isErr<T, E>(result: Result<T, E>): result is { readonly ok: false; readonly error: E } {
  return result.ok === false;
}

/**
 * Executes a fallible synchronous operation and converts it to a Result<T, AppError | Error>.
 */
export function tryCatch<T>(operation: () => T): Result<T, AppError | Error> {
  try {
    return ok(operation());
  } catch (caught) {
    if (isAppError(caught)) {
      return err(caught);
    }
    return err(caught instanceof Error ? caught : new Error(String(caught)));
  }
}

/**
 * Executes a fallible asynchronous operation and converts it to a Promise<Result<T, AppError | Error>>.
 */
export async function tryCatchAsync<T>(operation: () => Promise<T>): Promise<Result<T, AppError | Error>> {
  try {
    const data = await operation();
    return ok(data);
  } catch (caught) {
    if (isAppError(caught)) {
      return err(caught);
    }
    return err(caught instanceof Error ? caught : new Error(String(caught)));
  }
}

// =============================================================================
// Canonical User-Facing Error Translation
// =============================================================================

export type ErrorContext = "session" | "queue" | "auth" | "background_poll" | "general";

/**
 * Translates application and system errors into safe, human-facing sanctuary messages.
 *
 * Rules:
 * 1. Cancellation (aborted / AbortError) is treated as a routine lifecycle event (returns null).
 * 2. Explicitly handles SESSION_NOT_FOUND alongside NOT_FOUND.
 * 3. In "session" context, missing session is reported ("This conversation has ended or is no longer available.").
 * 4. In "background_poll" context, routine heartbeat/polling misses are silent (returns null).
 * 5. In "general" context, genuine missing resources remain observable.
 * 6. Offline status is only applied after checking cancellation and specific API codes.
 * 7. Never leaks internal server strings, database diagnostics, or SQL keywords to users.
 */
export function formatUserFacingError(error: unknown, context: ErrorContext = "general"): string | null {
  if (!error) return null;

  if (typeof error === "string") {
    return error;
  }

  // 1. Check for intentional user or component request cancellation
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("aborted")) {
      return null;
    }
  }

  // 2. Check for structured API and application errors
  if (isApiClientError(error) || isAppError(error)) {
    const isNotFound =
      error.statusCode === 404 ||
      error.code === "NOT_FOUND" ||
      error.code === "SESSION_NOT_FOUND" ||
      error.message.includes("Line not found") ||
      error.message.includes("Chat session not found") ||
      error.message.includes("conversation has ended");

    if (isNotFound) {
      if (context === "session") {
        return "This conversation has ended or is no longer available.";
      }
      if (context === "background_poll") {
        return null;
      }
      return "The requested sanctuary resource was not found.";
    }

    if (error.statusCode === 429 || error.code === "RATE_LIMIT_EXCEEDED") {
      return "You are sending thoughts too quickly. Please pause a moment.";
    }

    if (error.statusCode === 401 || error.statusCode === 403 || error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") {
      return "Session credentials out of sync. Reconnecting...";
    }

    if (error.code === "VALIDATION_ERROR" || error.statusCode === 400) {
      if (error.message.includes("Message too long")) {
        return "Message exceeds character limit (280 characters).";
      }
      if (error.message.includes("Callsign too long")) {
        return "Callsign must be 64 characters or fewer.";
      }
      if (error.message.includes("Banned phrase") || error.message.includes("moderation")) {
        return "Message contains language that violates sanctuary community guidelines.";
      }
      return "Unable to process request. Please check your message.";
    }

    if (error.statusCode >= 500) {
      return "Sanctuary server encountered a quiet hitch. Please try again.";
    }
  }

  // 3. Check for network transport errors
  if (error instanceof Error) {
    const msg = error.message;
    const isNetworkFailure =
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("Load failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT");

    if (isNetworkFailure) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return "You are offline. Please check your internet connection.";
      }
      return "Unable to reach Luna sanctuary. Reconnecting...";
    }

    // Check specific known message patterns from third-party wrappers
    if (
      msg.includes("Line not found") ||
      msg.includes("Chat session not found") ||
      msg.includes("conversation has ended")
    ) {
      if (context === "session") {
        return "This conversation has ended or is no longer available.";
      }
      if (context === "background_poll") {
        return null;
      }
      return "The requested sanctuary resource was not found.";
    }
  }

  // 4. Refined offline check for unclassified failures while offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You are offline. Please check your internet connection.";
  }

  // 5. Safe default: Never leak raw internal/server messages
  return "An unexpected hitch occurred. Please try again.";
}

