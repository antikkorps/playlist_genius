import { SpotifyService } from "../services/spotify"
import { LoggerService } from "../services/logger"
import { LogLevel } from "../types"
import { CacheService } from "../services/cache"
import SpotifyWebApi from "spotify-web-api-node"

jest.mock("spotify-web-api-node")

describe("SpotifyService", () => {
  let spotifyService: SpotifyService
  let mockCacheService: jest.Mocked<CacheService>
  let mockLoggerService: LoggerService
  let mockSpotifyApi: jest.Mocked<SpotifyWebApi>

  const cacheService = new CacheService()
  const loggerService = new LoggerService({ level: LogLevel.INFO, consoleOutput: true })

  const mockCredentials = {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost:3000/callback",
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock SpotifyWebApi
    mockSpotifyApi = {
      createAuthorizeURL: jest.fn().mockReturnValue("http://mock-auth-url"),
      refreshAccessToken: jest.fn().mockResolvedValue({
        body: {
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          expires_in: 3600,
          scope: "user-read-private playlist-modify-public",
          token_type: "Bearer",
        },
      }),
      setAccessToken: jest.fn(),
      setRefreshToken: jest.fn(),
      getRefreshToken: jest.fn().mockReturnValue("mock-refresh-token"),
      searchTracks: jest.fn(),
      getAudioFeaturesForTrack: jest.fn(),
      createPlaylist: jest.fn(),
      addTracksToPlaylist: jest.fn(),
      getArtist: jest.fn(),
      getRecommendations: jest.fn(),
      getArtistTopTracks: jest.fn(),
      getArtistRelatedArtists: jest.fn(),
      getMyTopTracks: jest.fn(),
      getMyRecentlyPlayedTracks: jest.fn(),
      getTracks: jest.fn(),
    } as unknown as jest.Mocked<SpotifyWebApi>

    // @ts-ignore
    SpotifyWebApi.mockImplementation(() => mockSpotifyApi)

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn(),
    } as unknown as jest.Mocked<CacheService>

    mockLoggerService = new LoggerService({
      level: LogLevel.DEBUG,
      consoleOutput: false,
    })

    spotifyService = new SpotifyService(
      mockCredentials,
      mockCacheService,
      mockLoggerService
    )
  })

  describe("authentication", () => {
    test("gets authorization URL with correct scopes", async () => {
      mockSpotifyApi.createAuthorizeURL.mockReturnValue(
        `http://mock-auth-url?client_id=${mockCredentials.clientId}&scope=user-read-private playlist-modify-public`
      )

      const authUrl = spotifyService.getAuthorizationUrl()
      expect(authUrl).toContain(mockCredentials.clientId)
      expect(authUrl).toContain("user-read-private")
      expect(authUrl).toContain("playlist-modify-public")
    }, 15000)

    test("handles token refresh", async () => {
      const mockTokens = {
        accessToken: "new-access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
      }

      mockSpotifyApi.refreshAccessToken.mockResolvedValue({
        body: {
          access_token: mockTokens.accessToken,
          refresh_token: mockTokens.refreshToken,
          expires_in: mockTokens.expiresIn,
        },
      } as any)

      mockSpotifyApi.getRefreshToken.mockReturnValue(mockTokens.refreshToken)

      const result = await spotifyService.refreshAccessToken()
      expect(result).toEqual(mockTokens)
    }, 15000)
  })

  describe("track operations", () => {
    beforeEach(() => {
      // Assurer que l'authentification est valide pour chaque test
      mockSpotifyApi.getRefreshToken.mockReturnValue("valid-refresh-token")
      mockSpotifyApi.refreshAccessToken.mockResolvedValue({
        body: {
          access_token: "valid-access-token",
          refresh_token: "valid-refresh-token",
          expires_in: 3600,
        },
      } as any)
    })

    test("searches tracks with pagination", async () => {
      const mockTracks = [
        { id: "1", name: "Track 1" },
        { id: "2", name: "Track 2" },
      ]

      mockSpotifyApi.searchTracks.mockResolvedValue({
        body: {
          tracks: {
            items: mockTracks,
          },
        },
      } as any)

      const result = await spotifyService.searchTracks("test query", 2)
      expect(result).toEqual(mockTracks)
    }, 15000)

    test("gets track features with caching", async () => {
      const mockFeatures = {
        id: "1",
        tempo: 120,
        energy: 0.8,
      }

      mockCacheService.get.mockReturnValueOnce(undefined)
      mockSpotifyApi.getAudioFeaturesForTrack.mockResolvedValue({
        body: mockFeatures,
      } as any)

      const result1 = await spotifyService.getTrackFeatures("1")
      expect(result1).toEqual(mockFeatures)
      expect(mockCacheService.set).toHaveBeenCalled()

      mockCacheService.get.mockReturnValueOnce(mockFeatures)
      const result2 = await spotifyService.getTrackFeatures("1")
      expect(result2).toEqual(mockFeatures)
    }, 15000)
  })

  describe("playlist operations", () => {
    beforeEach(() => {
      // Assurer que l'authentification est valide pour chaque test
      mockSpotifyApi.getRefreshToken.mockReturnValue("valid-refresh-token")
      mockSpotifyApi.refreshAccessToken.mockResolvedValue({
        body: {
          access_token: "valid-access-token",
          refresh_token: "valid-refresh-token",
          expires_in: 3600,
        },
      } as any)
    })

    test("creates playlist with tracks", async () => {
      const mockPlaylistId = "new-playlist-id"
      const mockTracks = ["track1", "track2"]

      mockSpotifyApi.createPlaylist.mockResolvedValue({
        body: {
          id: mockPlaylistId,
        },
      } as any)

      mockSpotifyApi.addTracksToPlaylist.mockResolvedValue({} as any)

      const result = await spotifyService.createPlaylist(
        "user-id",
        "New Playlist",
        mockTracks
      )

      expect(result).toBe(mockPlaylistId)
      expect(mockSpotifyApi.addTracksToPlaylist).toHaveBeenCalledWith(
        mockPlaylistId,
        mockTracks.map((id) => `spotify:track:${id}`)
      )
    }, 15000)
  })

  describe("error handling", () => {
    test("handles authentication errors", async () => {
      mockSpotifyApi.searchTracks.mockRejectedValue({ statusCode: 401 })
      mockSpotifyApi.refreshAccessToken.mockRejectedValue(new Error("Auth failed"))

      await expect(spotifyService.searchTracks("test")).rejects.toThrow()
    }, 15000)

    test("handles getArtist error", async () => {
      mockSpotifyApi.getArtist.mockRejectedValue(new Error("Artist not found"))

      const result = await spotifyService.getArtist("non-existent-artist-id")
      expect(result).toEqual({
        id: "non-existent-artist-id",
        name: "",
        type: "artist",
        uri: `spotify:artist:non-existent-artist-id`,
        genres: [],
        href: "",
        external_urls: { spotify: "" },
        followers: { href: null, total: 0 },
        images: [],
        popularity: 0,
      })
    }, 15000)
  })
})
