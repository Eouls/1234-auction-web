import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type AppLogLevel = "ERROR" | "WARN";

type LogAppErrorInput = {
  auctionId?: string | null;
  level?: AppLogLevel;
  message: string;
  metadata?: Record<string, unknown> | null;
  scope: string;
  userId?: string | null;
};

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;
const MAX_METADATA_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 4;

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|password|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|riot[_-]?api[_-]?key|database[_-]?url|direct[_-]?url|supabase.*key)/i;

export async function logAppError({
  auctionId = null,
  level = "ERROR",
  message,
  metadata = null,
  scope,
  userId = null,
}: LogAppErrorInput) {
  try {
    await prisma.appLog.create({
      data: {
        auctionId,
        level,
        message: truncate(String(message), MAX_MESSAGE_LENGTH),
        metadata: metadata ? (sanitizeMetadata(metadata) as Prisma.InputJsonValue) : undefined,
        scope: truncate(String(scope), MAX_MESSAGE_LENGTH),
        userId,
      },
    });
  } catch (error) {
    console.warn("[app-log] failed to persist log", {
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      scope,
    });
  }
}

export function errorToLogMetadata(error: unknown) {
  if (error instanceof Error) {
    return {
      code: getErrorCode(error),
      message: truncate(error.message, MAX_MESSAGE_LENGTH),
      name: error.name,
      stack: error.stack ? truncate(error.stack, MAX_STACK_LENGTH) : null,
    };
  }

  if (typeof error === "object" && error !== null) {
    return sanitizeMetadata(error as Record<string, unknown>);
  }

  return {
    message: truncate(String(error), MAX_MESSAGE_LENGTH),
    name: typeof error,
  };
}

function sanitizeMetadata(value: unknown, depth = 0): Prisma.JsonValue {
  if (depth > MAX_DEPTH) return "[TRUNCATED_DEPTH]";
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return errorToLogMetadata(value) as Prisma.JsonObject;

  if (typeof value === "string") return truncate(value, MAX_METADATA_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeMetadata(item, depth + 1));
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  const sanitized: Prisma.JsonObject = {};

  for (const [key, item] of entries) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[REDACTED]"
      : sanitizeMetadata(item, depth + 1);
  }

  return sanitized;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getErrorCode(error: Error) {
  if ("code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" || typeof code === "number" ? String(code) : null;
  }

  return null;
}
