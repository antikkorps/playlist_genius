import { PlaylistGenius } from "../index"

describe("PlaylistGenius", () => {
  let playlistGenius: PlaylistGenius

  beforeEach(() => {
    // Utilisez une clé API de test ou un mock
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
