import SpotifyWebApi from "spotify-web-api-node"
import {
  PlaylistCriteria,
  SpotifyCredentials,
  SpotifyAuthTokens,
  LogLevel,
} from "../types"
import { CacheService } from "./cache"
import { LoggerService, ContextLogger } from "./logger"

export class SpotifyService {
  private spotify: SpotifyWebApi
  private tokenExpirationTime: number = 0
  private retryCount: number = 0
  private readonly MAX_RETRIES: number = 3
  private logger: ContextLogger

  constructor(
    credentials: SpotifyCredentials,
    private cacheService: CacheService,
    loggerService?: LoggerService
  ) {
    const logger =
      loggerService ||
      new LoggerService({
        level: LogLevel.INFO,
        consoleOutput: true,
      })

    this.logger = logger.createContextLogger("SpotifyService")
    this.logger.info("Initializing Spotify service", {
      clientId: credentials.clientId,
      redirectUri: credentials.redirectUri,
    })
    this.spotify = new SpotifyWebApi({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: credentials.redirectUri,
    })
  }

  private async ensureValidToken(): Promise<void> {
    try {
      if (Date.now() >= this.tokenExpirationTime) {
        console.log("Token expired or missing, refreshing...")
        const refreshToken = this.spotify.getRefreshToken()

        if (!refreshToken) {
          console.log("No refresh token available, need to re-authenticate")
          throw new Error("Authentication required")
        }

        const data = await this.spotify.refreshAccessToken()
        this.spotify.setAccessToken(data.body["access_token"])
        this.tokenExpirationTime = Date.now() + data.body["expires_in"] * 1000
        this.retryCount = 0 // Réinitialiser le compteur après un succès
        console.log("Token refreshed successfully")
      }
    } catch (error: any) {
      console.error("Error in ensureValidToken:", error.message)

      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++
        console.log(`Retry attempt ${this.retryCount}/${this.MAX_RETRIES}`)
        await new Promise((resolve) => setTimeout(resolve, 1000 * this.retryCount))
        return this.ensureValidToken()
      }

      throw error
    }
  }

  private async makeSpotifyRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      await this.ensureValidToken()
      return await request()
    } catch (error: any) {
      if (error.statusCode === 401 && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++
        console.log(
          `API request failed, retry attempt ${this.retryCount}/${this.MAX_RETRIES}`
        )
        await new Promise((resolve) => setTimeout(resolve, 1000 * this.retryCount))
        return this.makeSpotifyRequest(request)
      }
      throw error
    }
  }

  getAuthorizationUrl(): string {
    const scopes = [
      "user-read-private",
      "user-read-email",
      "user-top-read",
      "user-read-recently-played",
      "playlist-modify-public",
      "playlist-modify-private",
      "user-library-read",
      "user-library-modify",
    ]

    console.log("Requesting scopes:", scopes)
    return this.spotify.createAuthorizeURL(scopes, "state")
  }

  async getTokens(code: string): Promise<SpotifyAuthTokens> {
    try {
      const data = await this.spotify.authorizationCodeGrant(code)

      const tokens = {
        accessToken: data.body["access_token"],
        refreshToken: data.body["refresh_token"],
        expiresIn: data.body["expires_in"],
      }

      this.setTokens(tokens)
      return tokens
    } catch (error) {
      console.error("Error getting tokens:", error)
      throw new Error("Failed to get Spotify tokens")
    }
  }

  setTokens(tokens: SpotifyAuthTokens): void {
    this.spotify.setAccessToken(tokens.accessToken)
    if (tokens.refreshToken) {
      this.spotify.setRefreshToken(tokens.refreshToken)
    }
    this.tokenExpirationTime = Date.now() + tokens.expiresIn * 1000
  }

  async refreshAccessToken(): Promise<SpotifyAuthTokens> {
    try {
      const data = await this.spotify.refreshAccessToken()

      const tokens = {
        accessToken: data.body["access_token"],
        refreshToken: this.spotify.getRefreshToken() || "",
        expiresIn: data.body["expires_in"],
      }

      this.setTokens(tokens)
      return tokens
    } catch (error) {
      console.error("Error refreshing token:", error)
      throw new Error("Failed to refresh Spotify token")
    }
  }

  async handleAuthCallback(code: string): Promise<SpotifyAuthTokens> {
    const data = await this.spotify.authorizationCodeGrant(code)

    const tokens = {
      accessToken: data.body["access_token"],
      refreshToken: data.body["refresh_token"],
      expiresIn: data.body["expires_in"],
    }

    this.setTokens(tokens)
    return tokens
  }

  async searchTracks(
    query: string,
    limit: number = 10
  ): Promise<SpotifyApi.TrackObjectFull[]> {
    await this.ensureValidToken()

    const response = await this.spotify.searchTracks(query, { limit })
    return response.body.tracks?.items || []
  }

  async getTrackFeatures(trackId: string): Promise<SpotifyApi.AudioFeaturesObject> {
    console.log(`Getting features for track ${trackId}...`)
    try {
      const cached = this.cacheService?.get<SpotifyApi.AudioFeaturesObject>({
        type: "audio_features",
        criteria: { trackId },
      })

      if (cached) {
        return cached
      }

      await this.ensureValidToken()
      const response = await this.spotify.getAudioFeaturesForTrack(trackId)
      this.cacheService?.set(
        {
          type: "audio_features",
          criteria: { trackId },
        },
        response.body
      )
      console.log("Track features retrieved successfully")
      return response.body
    } catch (error: any) {
      console.error("Error getting track features:", error.message)
      throw error
    }
  }

  async getArtist(artistId: string): Promise<SpotifyApi.ArtistObjectFull> {
    await this.ensureValidToken()
    try {
      const response = await this.spotify.getArtist(artistId)
      return response.body
    } catch (error) {
      console.error("Error getting artist:", error)
      return {
        id: artistId,
        name: "",
        type: "artist",
        uri: `spotify:artist:${artistId}`,
        genres: [],
        href: "",
        external_urls: { spotify: "" },
        followers: { href: null, total: 0 },
        images: [],
        popularity: 0,
      }
    }
  }

  async getRecommendations(
    criteria: PlaylistCriteria
  ): Promise<SpotifyApi.TrackObjectSimplified[]> {
    await this.ensureValidToken()

    const params: SpotifyApi.RecommendationsOptionsObject = {
      limit: 20,
      seed_genres: [],
      min_popularity: 50,
    }

    if (criteria.genres?.length) {
      params.seed_genres = criteria.genres.slice(0, 5)
    }

    if (criteria.tempo) {
      switch (criteria.tempo) {
        case "slow":
          params.target_tempo = 80
          break
        case "medium":
          params.target_tempo = 120
          break
        case "fast":
          params.target_tempo = 160
          break
      }
    }

    if (criteria.mood) {
      switch (criteria.mood.toLowerCase()) {
        case "energetic":
          params.target_energy = 0.8
          params.target_valence = 0.7
          break
        case "calm":
          params.target_energy = 0.3
          params.target_valence = 0.5
          break
        case "happy":
          params.target_valence = 0.8
          break
        case "sad":
          params.target_valence = 0.2
          break
      }
    }

    const response = await this.spotify.getRecommendations(params)
    return response.body.tracks
  }

  async createPlaylist(userId: string, name: string, tracks: string[]): Promise<string> {
    await this.ensureValidToken()

    // Créer la playlist avec le bon typage
    const playlist = await this.spotify.createPlaylist(name, {
      description: "Created by PlaylistGenius",
      public: false,
    })

    if (!playlist.body.id) {
      throw new Error("Failed to create playlist")
    }

    // Ajouter les tracks avec le bon format
    await this.spotify.addTracksToPlaylist(
      playlist.body.id,
      tracks.map((id) => `spotify:track:${id}`)
    )

    return playlist.body.id
  }

  async getTopTracks(artistId: string): Promise<SpotifyApi.TrackObjectFull[]> {
    await this.ensureValidToken()

    const response = await this.spotify.getArtistTopTracks(artistId, "US")
    return response.body.tracks
  }

  async getSimilarArtists(artistId: string): Promise<SpotifyApi.ArtistObjectFull[]> {
    await this.ensureValidToken()

    const response = await this.spotify.getArtistRelatedArtists(artistId)
    return response.body.artists
  }

  async getUserTopTracks(
    timeRange: "short_term" | "medium_term" | "long_term",
    limit: number = 50
  ): Promise<SpotifyApi.TrackObjectFull[]> {
    return this.makeSpotifyRequest(async () => {
      console.log(`Getting user top tracks for ${timeRange}...`)

      try {
        const topTracks = await this.spotify.getMyTopTracks({
          time_range: timeRange,
          limit,
        })

        if (topTracks.body.items.length === 0) {
          console.log("No top tracks found, fetching recently played tracks...")
          const recentTracks = await this.getRecentlyPlayed(limit)
          const uniqueTracks = new Map<string, SpotifyApi.TrackObjectFull>()

          recentTracks.forEach((item) => {
            if (!uniqueTracks.has(item.track.id)) {
              uniqueTracks.set(item.track.id, item.track)
            }
          })

          const tracks = Array.from(uniqueTracks.values())
          if (tracks.length > 0) return tracks

          console.log("No recent tracks found, getting recommendations...")
          return this.getNewUserRecommendations()
        }

        return topTracks.body.items
      } catch (error) {
        console.error("Error in getUserTopTracks:", error)
        return this.getNewUserRecommendations()
      }
    })
  }

  async getRecentlyPlayed(limit: number = 50): Promise<SpotifyApi.PlayHistoryObject[]> {
    await this.ensureValidToken()
    try {
      const response = await this.spotify.getMyRecentlyPlayedTracks({ limit })
      return response.body.items
    } catch (error) {
      console.error("Error getting recently played tracks:", error)
      return []
    }
  }

  async getNewUserRecommendations(): Promise<SpotifyApi.TrackObjectFull[]> {
    return this.makeSpotifyRequest(async () => {
      try {
        const seedGenres = ["pop", "rock", "hip-hop", "electronic", "indie"]

        const recommendations = await this.spotify.getRecommendations({
          seed_genres: seedGenres.slice(0, 2),
          target_popularity: 75,
          limit: 20,
        })

        const trackIds = recommendations.body.tracks.map((track) => track.id)
        const fullTracksResponse = await this.spotify.getTracks(trackIds)

        return fullTracksResponse.body.tracks
      } catch (error) {
        console.error("Error getting new user recommendations:", error)
        return []
      }
    })
  }

  private async getTracksAudioFeatures(
    trackIds: string[]
  ): Promise<SpotifyApi.AudioFeaturesObject[]> {
    const BATCH_SIZE = 100
    const results: SpotifyApi.AudioFeaturesObject[] = []

    // Diviser les trackIds en batches
    for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
      const batch = trackIds.slice(i, i + BATCH_SIZE)

      // Vérifier quels tracks sont déjà en cache
      const uncachedTracks = batch.filter(
        (id) =>
          !this.cacheService?.get({
            type: "audio_features",
            criteria: { trackId: id },
          })
      )

      if (uncachedTracks.length > 0) {
        await this.ensureValidToken()
        const response = await this.spotify.getAudioFeaturesForTracks(uncachedTracks)

        // Mettre en cache les nouveaux résultats
        response.body.audio_features.forEach((features, index) => {
          if (features) {
            this.cacheService?.set(
              {
                type: "audio_features",
                criteria: { trackId: uncachedTracks[index] },
              },
              features
            )
          }
        })
      }

      const batchResults = await Promise.all(batch.map((id) => this.getTrackFeatures(id)))

      results.push(...batchResults)
    }

    return results
  }
}
