type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): number {
  const envLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  return LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
}

function formatLog(level: LogLevel, event: string, data: Record<string, unknown>): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= getMinLevel();
}

export const treasuryLogger = {
  debug(event: string, data: Record<string, unknown> = {}): void {
    if (shouldLog("debug")) {
      console.debug(formatLog("debug", event, data));
    }
  },

  info(event: string, data: Record<string, unknown> = {}): void {
    if (shouldLog("info")) {
      console.info(formatLog("info", event, data));
    }
  },

  warn(event: string, data: Record<string, unknown> = {}): void {
    if (shouldLog("warn")) {
      console.warn(formatLog("warn", event, data));
    }
  },

  error(event: string, data: Record<string, unknown> = {}): void {
    if (shouldLog("error")) {
      console.error(formatLog("error", event, data));
    }
  },
};
