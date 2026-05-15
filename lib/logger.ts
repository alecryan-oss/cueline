import pino, { type Logger } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  base: { service: 'cueline' },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname,service',
          },
        },
      }),
});

export type LogContext = {
  tenant_id?: string;
  call_id?: string;
  event_id?: string | number;
  user_id?: string;
  [key: string]: unknown;
};

export function createChildLogger(context: LogContext): Logger {
  return logger.child(context);
}
