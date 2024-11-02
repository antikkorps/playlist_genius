import { CacheService } from "../services/cache"
import { PlaylistCriteria, GenerationResult } from "../types"

describe("CacheService", () => {
  let cacheService: CacheService

  beforeEach(() => {
    cacheService = new CacheService({
      stdTTL: 60,
      checkperiod: 30,
      maxKeys: 100,
    })
  })

  const mockCriteria: PlaylistCriteria = {
    genres: ["rock", "indie"],
    mood: "energetic",
    tempo: "fast" as const,
  }

  const mockResult: GenerationResult = {
    songs: [
      {
        title: "Test Song",
        artist: "Test Artist",
        genre: ["rock"],
        tempo: 120,
        popularity: 80,
        year: 2024,
        duration: 180,
      },
    ],
    explanation: "Test explanation",
    tags: ["rock", "energetic"],
  }

  test("should store and retrieve values", () => {
    const cacheKey = {
      type: "playlist" as const,
      criteria: mockCriteria,
    }

    cacheService.set(cacheKey, mockResult)
    const cachedResult = cacheService.get<GenerationResult>(cacheKey)
    expect(cachedResult).toEqual(mockResult)
  })

  test("should handle arrays in different orders", () => {
    const key1 = {
      type: "playlist" as const,
      criteria: {
        genres: ["rock", "indie"],
        mood: "energetic",
      },
    }

    const key2 = {
      type: "playlist" as const,
      criteria: {
        genres: ["indie", "rock"],
        mood: "energetic",
      },
    }

    cacheService.set(key1, mockResult)
    const cachedResult = cacheService.get<GenerationResult>(key2)
    expect(cachedResult).toEqual(mockResult)
  })

  test("should handle object properties in different orders", () => {
    const key1 = {
      type: "playlist" as const,
      criteria: {
        genres: ["rock"],
        mood: "energetic",
      },
    }

    const key2 = {
      type: "playlist" as const,
      criteria: {
        mood: "energetic",
        genres: ["rock"],
      },
    }

    cacheService.set(key1, mockResult)
    const cachedResult = cacheService.get<GenerationResult>(key2)
    expect(cachedResult).toEqual(mockResult)
  })

  test("should handle cache invalidation", () => {
    const cacheKey = {
      type: "playlist" as const,
      criteria: mockCriteria,
    }

    cacheService.set(cacheKey, mockResult)
    cacheService.invalidate(cacheKey)
    const cachedResult = cacheService.get<GenerationResult>(cacheKey)
    expect(cachedResult).toBeUndefined()
  })

  test("should track cache statistics", () => {
    const key1 = {
      type: "playlist" as const,
      criteria: mockCriteria,
    }

    const key2 = {
      type: "playlist" as const,
      criteria: { genres: ["pop"] },
    }

    cacheService.set(key1, mockResult)
    cacheService.get(key1) // Hit
    cacheService.get(key2) // Miss

    const stats = cacheService.getStats()
    expect(stats.hits).toBeGreaterThan(0)
    expect(stats.misses).toBeGreaterThan(0)
  })

  test("should handle nested arrays and objects", () => {
    const key1 = {
      type: "playlist" as const,
      criteria: {
        genres: ["rock", "indie"],
        yearRange: { start: 2020, end: 2024 },
      },
    }

    const key2 = {
      type: "playlist" as const,
      criteria: {
        yearRange: { end: 2024, start: 2020 },
        genres: ["indie", "rock"],
      },
    }

    cacheService.set(key1, mockResult)
    const cachedResult = cacheService.get<GenerationResult>(key2)
    expect(cachedResult).toEqual(mockResult)
  })
})
