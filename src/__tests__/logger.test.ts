import { LoggerService, ContextLogger } from "../services/logger"
import { LogLevel } from "../types"
import winston from "winston"

type WinstonLogLevel = "error" | "warn" | "info" | "http" | "debug"

jest.mock("winston", () => {
  // Définition des niveaux de log
  const levels: Record<WinstonLogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  }

  // Helper pour créer un mock logger qui respecte les niveaux
  const createMockLoggerWithLevels = (config: { level: string }) => {
    const configuredLevel = config.level as WinstonLogLevel
    const configuredLevelValue = levels[configuredLevel] ?? levels.info

    // Créer les fonctions mock
    const mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      http: jest.fn(),
      debug: jest.fn(),
    }

    // Remplacer chaque méthode par une version qui vérifie le niveau
    Object.entries(levels).forEach(([level, value]) => {
      const originalMethod = mockLogger[level as WinstonLogLevel]
      mockLogger[level as WinstonLogLevel] = jest.fn((...args) => {
        if (value <= configuredLevelValue) {
          return originalMethod(...args)
        }
      })
    })

    return mockLogger
  }

  return {
    format: {
      combine: jest.fn().mockReturnValue({}),
      timestamp: jest.fn().mockReturnValue({}),
      errors: jest.fn().mockReturnValue({}),
      json: jest.fn().mockReturnValue({}),
      colorize: jest.fn().mockReturnValue({}),
      printf: jest.fn().mockReturnValue({}),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
    createLogger: jest.fn().mockImplementation((config) => {
      // Retourner un nouveau mock logger pour chaque appel
      return createMockLoggerWithLevels(config)
    }),
    config: {
      npm: {
        levels,
      },
    },
  }
})

describe("LoggerService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("creates context logger", () => {
    const loggerService = new LoggerService({
      level: LogLevel.DEBUG,
      consoleOutput: true,
    })
    const contextLogger = loggerService.createContextLogger("TestContext")
    expect(contextLogger).toBeInstanceOf(ContextLogger)
  })

  test("logs at different levels", () => {
    const loggerService = new LoggerService({
      level: LogLevel.DEBUG,
      consoleOutput: true,
    })
    const logger = loggerService.createContextLogger("TestContext")
    const mockLogger = (winston.createLogger as jest.Mock).mock.results[0].value

    logger.debug("Debug message")
    logger.info("Info message")
    logger.warn("Warning message")
    logger.error("Error message")

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Debug message",
      expect.objectContaining({ service: "TestContext" })
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Info message",
      expect.objectContaining({ service: "TestContext" })
    )
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Warning message",
      expect.objectContaining({ service: "TestContext" })
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error message",
      expect.objectContaining({ service: "TestContext" })
    )
  })

  test("includes context in log messages", () => {
    const loggerService = new LoggerService({
      level: LogLevel.DEBUG,
      consoleOutput: true,
    })
    const logger = loggerService.createContextLogger("TestContext")
    const mockLogger = (winston.createLogger as jest.Mock).mock.results[0].value

    logger.info("Test message")

    expect(mockLogger.info).toHaveBeenCalledWith(
      "Test message",
      expect.objectContaining({
        service: "TestContext",
      })
    )
  })

  test("handles errors with stack traces", () => {
    const loggerService = new LoggerService({
      level: LogLevel.DEBUG,
      consoleOutput: true,
    })
    const logger = loggerService.createContextLogger("TestContext")
    const mockLogger = (winston.createLogger as jest.Mock).mock.results[0].value

    const error = new Error("Test error")
    logger.error("Error occurred", error)

    expect(mockLogger.error).toHaveBeenCalledWith("Error occurred", {
      error: {
        message: error.message,
        stack: expect.any(String),
        service: "TestContext",
      },
    })
  })

  test("configures winston formats correctly", () => {
    new LoggerService({
      level: LogLevel.DEBUG,
      consoleOutput: true,
    })
    expect(winston.format.combine).toHaveBeenCalled()
    expect(winston.format.timestamp).toHaveBeenCalled()
    expect(winston.format.errors).toHaveBeenCalled()
    expect(winston.format.json).toHaveBeenCalled()
  })

  test("configures transports correctly", () => {
    const loggerWithFile = new LoggerService({
      level: LogLevel.INFO,
      filename: "test.log",
      consoleOutput: true,
    })

    expect(winston.transports.File).toHaveBeenCalled()
    expect(winston.transports.Console).toHaveBeenCalled()
  })
})
