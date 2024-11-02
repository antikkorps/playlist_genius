import SpotifyWebApi from "spotify-web-api-node"
import { PlaylistCriteria, SpotifyCredentials, SpotifyAuthTokens } from "../types"

export class SpotifyService {
  private spotify: SpotifyWebApi
  private tokenExpirationTime: number = 0

  constructor(credentials: SpotifyCredentials) {
    this.spotify = new SpotifyWebApi({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: credentials.redirectUri,
    })
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

  private async ensureValidToken(): Promise<void> {
    if (Date.now() > this.tokenExpirationTime) {
      if (!this.spotify.getRefreshToken()) {
        throw new Error("No refresh token available. User must re-authenticate.")
      }

      const data = await this.spotify.refreshAccessToken()
      this.spotify.setAccessToken(data.body["access_token"])
      this.tokenExpirationTime = Date.now() + data.body["expires_in"] * 1000
    }
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
    await this.ensureValidToken()
    try {
      const response = await this.spotify.getAudioFeaturesForTrack(trackId)
      return response.body
    } catch (error) {
      console.error("Error getting track features:", error)
      return {
        danceability: 0,
        energy: 0,
        key: 0,
        loudness: 0,
        mode: 0,
        speechiness: 0,
        acousticness: 0,
        instrumentalness: 0,
        liveness: 0,
        valence: 0,
        tempo: 0,
        type: "audio_features",
        id: trackId,
        uri: `spotify:track:${trackId}`,
        track_href: `https://api.spotify.com/v1/tracks/${trackId}`,
        analysis_url: "",
        duration_ms: 0,
        time_signature: 4,
      }
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

  // Nouvelles méthodes pour l'historique d'écoute
  async getUserTopTracks(
    timeRange: "short_term" | "medium_term" | "long_term",
    limit: number = 50
  ): Promise<SpotifyApi.TrackObjectFull[]> {
    await this.ensureValidToken()
    try {
      const response = await this.spotify.getMyTopTracks({
        time_range: timeRange,
        limit,
      })
      return response.body.items
    } catch (error) {
      console.error("Error getting user top tracks:", error)
      throw error
    }
  }

  async getRecentlyPlayed(limit: number = 50): Promise<SpotifyApi.PlayHistoryObject[]> {
    await this.ensureValidToken()

    const response = await this.spotify.getMyRecentlyPlayedTracks({ limit })
    return response.body.items
  }

  private async getTracksAudioFeatures(
    trackIds: string[]
  ): Promise<SpotifyApi.AudioFeaturesObject[]> {
    await this.ensureValidToken()

    const response = await this.spotify.getAudioFeaturesForTracks(trackIds)
    return response.body.audio_features
  }
}
