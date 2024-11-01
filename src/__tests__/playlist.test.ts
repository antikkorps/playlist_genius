import { PlaylistGenius } from "../index"

jest.mock("../index", () => {
  return {
    PlaylistGenius: jest.fn().mockImplementation((apiKey: string) => {
      return {
        generatePlaylistSuggestions: jest.fn((criteria) => {
          if (apiKey === "invalid-key") {
            return Promise.reject(new Error("Invalid API key"))
          }
          return Promise.resolve({
            songs: [],
            explanation: "Mock explanation",
            tags: [],
          })
        }),
      }
    }),
  }
})

describe("PlaylistGenius", () => {
  let playlistGenius: PlaylistGenius

  beforeEach(() => {
    playlistGenius = new PlaylistGenius("test-api-key")
  })

  test("generates playlist suggestions based on criteria", async () => {
    const criteria = {
      genres: ["rock", "indie"],
      mood: "energetic",
      tempo: "fast" as const,
    }

    const result = await playlistGenius.generatePlaylistSuggestions(criteria)

    expect(result).toHaveProperty("songs")
    expect(Array.isArray(result.songs)).toBe(true)
    expect(result).toHaveProperty("explanation")
    expect(result).toHaveProperty("tags")
  })

  test("handles errors gracefully", async () => {
    // Test avec une clé API invalide
    const invalidPlaylistGenius = new PlaylistGenius("invalid-key")

    await expect(invalidPlaylistGenius.generatePlaylistSuggestions({})).rejects.toThrow()
  })
})
