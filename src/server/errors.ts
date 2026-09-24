export type ApiSuccess<T> = {
  success: true;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  success: false;
  message: string;
  code?: string;
  errors?: unknown;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_ERROR"
  | "INTERNAL_ERROR";

const httpStatusFor: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENT_REQUIRED: 402,
  PAYMENT_ERROR: 422,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly errors?: unknown;

  constructor(code: ErrorCode, message: string, options?: { expose?: boolean; errors?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = httpStatusFor[code];
    this.expose = options?.expose ?? true;
    this.errors = options?.errors;
  }

  static validation(message: string, errors?: unknown): ApiError {
    return new ApiError("VALIDATION_ERROR", message, { errors });
  }

  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError("UNAUTHORIZED", message);
  }

  static forbidden(message = "You do not have permission to perform this action"): ApiError {
    return new ApiError("FORBIDDEN", message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError("NOT_FOUND", message);
  }

  static conflict(message: string): ApiError {
    return new ApiError("CONFLICT", message);
  }

  static paymentError(message: string): ApiError {
    return new ApiError("PAYMENT_ERROR", message);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError("INTERNAL_ERROR", message, { expose: false });
  }
}

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { success: true, data, meta };
}

export function okMessage(message: string): ApiSuccess<null> {
  return { success: true, message, data: null };
}

export function fail(message: string, code: ErrorCode = "INTERNAL_ERROR"): ApiFailure {
  return { success: false, message, code };
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Converts any thrown value into an ApiEnvelope while keeping error details out
 * of client responses. Callers should log (`error` param) and return this.
 */
export function toEnvelope(error: unknown): { envelope: ApiFailure; status: number } {
  if (isApiError(error)) {
    return {
      envelope: {
        success: false,
        message: error.message,
        code: error.code,
        ...(error.errors !== undefined ? { errors: error.errors } : {}),
      },
      status: error.status,
    };
  }

  console.error("[api] unhandled error:", error);
  return {
    envelope: { success: false, message: "Internal server error", code: "INTERNAL_ERROR" },
    status: 500,
  };
}