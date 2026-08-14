import { getConfig } from "../config";

export type LogLevel = "debug" | "info" | "warn" | "error";

const priorities: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function log(
  level: LogLevel,
  message: string,
  metadata: Record<string, unknown> = {},
): void {
  const config = getConfig().logging;
  if (!config.enabled || priorities[level] < priorities[config.level ?? "info"])
    return;
  console[level](`[cp-api] ${message}`, metadata);
}
