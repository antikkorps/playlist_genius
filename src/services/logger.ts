import winston from "winston"
import { Format } from "logform"
import { LoggerConfig, LogLevel } from "../types"

export class LoggerService {
  private logger: winston.Logger

  constructor(config: LoggerConfig) {
    const formats = this.createFormats()
    const transports = this.createTransports(config, formats)

    this.logger = winston.createLogger({
      level: config.level,
      levels: winston.config.npm.levels,
      format: formats.combined,
      transports,
      exitOnError: false,
    })
  }

  private createFormats(): {
    basic: Format
    combined: Format
    console: Format
  } {
    const basic = winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.errors({ stack: true })
    )

    const combined = winston.format.combine(basic, winston.format.json())

    const console = winston.format.combine(
      basic,
      winston.format.colorize({ all: true }),
      winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
        const metaStr = Object.keys(meta).length
          ? `\n${JSON.stringify(meta, null, 2)}`
          : ""
        return `${timestamp} [${service || "app"}] ${level}: ${message}${metaStr}`
      })
    )

    return { basic, combined, console }
  }

  private createTransports(
    config: LoggerConfig,
    formats: { basic: Format; combined: Format; console: Format }
  ): winston.transport[] {
    const transports: winston.transport[] = []

    // File transport for all logs
    if (config.filename) {
      transports.push(
        new winston.transports.File({
          filename: config.filename,
          format: formats.combined,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          tailable: true,
        })
      )
    }

    // Console transport
    if (config.consoleOutput !== false) {
      transports.push(
        new winston.transports.Console({
          format: formats.console,
        })
      )
    }

    // Error specific file transport
    if (config.filename) {
      const errorLogPath = config.filename.replace(/\.log$/, ".error.log")
      transports.push(
        new winston.transports.File({
          filename: errorLogPath,
          level: LogLevel.ERROR,
          format: formats.combined,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          tailable: true,
        })
      )
    }

    return transports
  }

  debug(message: string, meta?: object): void {
    this.logger.debug(message, meta)
  }

  info(message: string, meta?: object): void {
    this.logger.info(message, meta)
  }

  warn(message: string, meta?: object): void {
    this.logger.warn(message, meta)
  }

  error(message: string, error?: Error | unknown, meta?: object): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: {
          message: error.message,
          stack: error.stack,
          ...meta,
        },
      })
    } else {
      this.logger.error(message, { error, ...meta })
    }
  }

  http(message: string, meta?: object): void {
    this.logger.http(message, meta)
  }

  // Méthode utilitaire pour créer un logger contextualisé
  createContextLogger(context: string): ContextLogger {
    return new ContextLogger(this, context)
  }
}

// Classe pour logger avec un contexte spécifique
export class ContextLogger {
  constructor(
    private logger: LoggerService,
    private context: string
  ) {}

  private addContext(meta?: object): object {
    return { ...meta, service: this.context }
  }

  debug(message: string, meta?: object): void {
    this.logger.debug(message, this.addContext(meta))
  }

  info(message: string, meta?: object): void {
    this.logger.info(message, this.addContext(meta))
  }

  warn(message: string, meta?: object): void {
    this.logger.warn(message, this.addContext(meta))
  }

  error(message: string, error?: Error | unknown, meta?: object): void {
    this.logger.error(message, error, this.addContext(meta))
  }

  http(message: string, meta?: object): void {
    this.logger.http(message, this.addContext(meta))
  }
}
