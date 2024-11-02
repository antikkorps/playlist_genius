import { CacheService } from "../services/cache"
import { PlaylistCriteria, GenerationResult } from "../types"

describe("CacheService", () => {
  let cacheService: CacheService

  beforeEach(() => {
    cacheService = new CacheService({
      stdTTL: 60, // 1 minute pour les tests
      checkperiod: 30,
      maxKeys: 100,
    })
  })

  const mockCriteria: PlaylistCriteria = {
    genres: ["rock", "indie"],
    mood: "energetic",
    tempo: "fast",
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
    cacheService.set(mockCriteria, mockResult)
    const cachedResult = cacheService.get(mockCriteria)
    expect(cachedResult).toEqual(mockResult)
  })

  test("should generate consistent cache keys for same criteria with different order", () => {
    const criteria1: PlaylistCriteria = {
      genres: ["rock", "indie"],
      mood: "energetic",
    }

    const criteria2: PlaylistCriteria = {
      mood: "energetic",
      genres: ["indie", "rock"],
    }

    cacheService.set(criteria1, mockResult)
    const cachedResult = cacheService.get(criteria2)
    expect(cachedResult).toEqual(mockResult)
  })

  test("should handle cache invalidation", () => {
    cacheService.set(mockCriteria, mockResult)
    cacheService.invalidate(mockCriteria)
    const cachedResult = cacheService.get(mockCriteria)
    expect(cachedResult).toBeUndefined()
  })

  test("should track cache statistics", () => {
    cacheService.set(mockCriteria, mockResult)
    cacheService.get(mockCriteria) // Hit
    cacheService.get({ genres: ["pop"] }) // Miss

    const stats = cacheService.getStats()
    expect(stats.hits).toBeGreaterThan(0)
    expect(stats.misses).toBeGreaterThan(0)
  })
})
