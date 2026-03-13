type LogLevel = 'info' | 'warn' | 'error' | 'debug';
type LogInput = string | { message: string; [key: string]: unknown };

const consoleMethods: Record<LogLevel, typeof console.log> = {
  info:  console.info,
  warn:  console.warn,
  error: console.error,
  debug: console.debug,
};

function formatMessage(level: LogLevel, input: LogInput): [string, ...unknown[]] {
  const timestamp = new Date().toISOString();
  const prefix = `[YTMusic] ${timestamp}`;

  if (typeof input === 'string') {
    return [`${prefix} [${level.toUpperCase()}] ${input}`];
  }

  const { message, ...rest } = input;
  const hasExtra = Object.keys(rest).length > 0;
  return hasExtra
    ? [`${prefix} [${level.toUpperCase()}] ${message}`, rest]
    : [`${prefix} [${level.toUpperCase()}] ${message}`];
}

function log(level: LogLevel, input: LogInput): void {
  consoleMethods[level](...formatMessage(level, input));
}

export const logger = {
  info:  (input: LogInput) => log('info',  input),
  warn:  (input: LogInput) => log('warn',  input),
  error: (input: LogInput) => log('error', input),
  debug: (input: LogInput) => log('debug', input),
};
