import { LoggerConfig } from "./types/index"
import { LoggerService, ContextLogger } from "./services/logger"
import { OpenAIService } from "./services/openai"
import { MusicAnalysisService } from "./services/musicAnalysis"
import { SpotifyService } from "./services/spotify"
import { CacheService } from "./services/cache"
import {
  PlaylistCriteria,
  GenerationResult,
  SongAnalysis,
  Artist,
  MusicTrend,
  Song,
  SpotifyCredentials,
  SpotifyAuthTokens,
  LogLevel,
} from "./types"
import { Context } from "vm"

export class PlaylistGenius {
  private openaiService: OpenAIService
  private musicAnalysisService: MusicAnalysisService
  private cacheService: CacheService
  private spotifyService?: SpotifyService
  private logger: ContextLogger

  constructor(
    private apiKey: string,
    spotifyCredentials?: SpotifyCredentials,
    LoggerConfig?: { level: LogLevel; filename?: string }
  ) {
    const logger = new LoggerService({
      level: LoggerConfig?.level || LogLevel.INFO,
      filename: LoggerConfig?.filename,
      consoleOutput: true,
    })

    this.logger = logger.createContextLogger("PlaylistGenius")

    this.logger.info("Initializing PlaylistGenius")
    try {
      this.openaiService = new OpenAIService(apiKey)
      this.musicAnalysisService = new MusicAnalysisService(apiKey)
      this.cacheService = new CacheService()

      if (spotifyCredentials) {
        this.logger.debug("Initializing Spotify service", {
          clientId: spotifyCredentials.clientId,
          redirectUri: spotifyCredentials.redirectUri,
        })
        this.spotifyService = new SpotifyService(
          spotifyCredentials,
          this.cacheService,
          logger
        )
      }

      this.logger.info("PlaylistGenius initialized successfully")
    } catch (error) {
      this.logger.error("Failed to initialize PlaylistGenius", error)
      throw error
    }
  }

  async generatePlaylistSuggestions(
    criteria: PlaylistCriteria
  ): Promise<GenerationResult> {
    this.logger.info("Generating playlist suggestions", { criteria })

    try {
      const cached = this.cacheService.get<GenerationResult>({
        type: "playlist",
        criteria,
      })

      if (cached) {
        this.logger.debug("Returning cached playlist suggestions", {
          criteria,
          songsCount: cached.songs.length,
        })
        return cached
      }

      this.logger.debug("Fetching new playlist suggestions")

      const result = await this.openaiService.getPlaylistSuggestions(criteria)

      this.logger.debug("Caching playlist suggestions", {
        criteria,
        songsCount: result.songs.length,
      })
      this.cacheService.set(
        {
          type: "playlist",
          criteria,
        },
        result
      )

      return result
    } catch (error) {
      this.logger.error("Error generating playlist", error, { criteria })
      throw new Error("Failed to generate playlist suggestions")
    }
  }

  async analyzeSong(title: string, artist: string): Promise<SongAnalysis> {
    this.logger.info("Analyzing song", { title, artist })

    try {
      const cached = this.cacheService.get<SongAnalysis>({
        type: "song_analysis",
        criteria: { title, artist },
      })

      if (cached) {
        this.logger.debug("Returning cached song analysis", { title, artist })
        return cached
      }

      this.logger.debug("Performing new song analysis")
      const analysis = await this.musicAnalysisService.analyzeSong(title, artist)

      this.logger.debug("Caching song analysis", { title, artist })
      this.cacheService.set(
        {
          type: "song_analysis",
          criteria: { title, artist },
        },
        analysis
      )

      return analysis
    } catch (error) {
      this.logger.error("Error analyzing song", error, { title, artist })
      throw error
    }
  }

  async findSimilarSongs(song: {
    title: string
    artist: string
  }): Promise<SongAnalysis[]> {
    this.logger.info("Finding similar songs", song)

    try {
      const songAnalysis = await this.analyzeSong(song.title, song.artist)

      if (!songAnalysis?.similarSongs) {
        this.logger.warn("No similar songs found", song)
        return []
      }

      this.logger.debug("Analyzing similar songs", {
        count: songAnalysis.similarSongs.length,
      })

      const similarSongsAnalyses = await Promise.all(
        songAnalysis.similarSongs.map(async (songString) => {
          try {
            const [title, artist] = songString.split(" by ").map((s) => s.trim())
            if (!title || !artist) {
              this.logger.warn("Invalid song format", { songString })
              return null
            }
            return await this.analyzeSong(title, artist)
          } catch (error) {
            this.logger.error("Error analyzing similar song", error, { songString })
            return null
          }
        })
      )

      const validAnalyses = similarSongsAnalyses.filter(
        (analysis): analysis is SongAnalysis => analysis !== null
      )

      this.logger.info("Similar songs analysis completed", {
        totalFound: validAnalyses.length,
      })

      return validAnalyses
    } catch (error) {
      this.logger.error("Error finding similar songs", error, song)
      return []
    }
  }

  async findSimilarArtists(artist: string): Promise<Artist[]> {
    this.logger.info("Finding similar artists", { artist })

    try {
      const cached = this.cacheService.get<Artist[]>({
        type: "similar_artists",
        criteria: { artist },
      })

      if (cached) {
        this.logger.debug("Returning cached similar artists", {
          artist,
          count: cached.length,
        })
        return cached
      }

      const artistAnalysis = await this.musicAnalysisService.analyzeArtist(artist)

      this.logger.debug("Analyzing similar artists", {
        count: artistAnalysis.similarArtists.length,
      })

      const similarArtists = await Promise.all(
        artistAnalysis.similarArtists.map(async (name) => {
          try {
            return await this.musicAnalysisService.analyzeArtist(name)
          } catch (error) {
            this.logger.error("Error analyzing similar artist", error, { name })
            return null
          }
        })
      )

      const validArtists = similarArtists.filter((a): a is Artist => a !== null)

      this.logger.debug("Caching similar artists results", {
        artist,
        count: validArtists.length,
      })

      this.cacheService.set(
        {
          type: "similar_artists",
          criteria: { artist },
        },
        validArtists
      )

      return validArtists
    } catch (error) {
      this.logger.error("Error finding similar artists", error, { artist })
      throw error
    }
  }

  async findPopularSongs(): Promise<GenerationResult> {
    this.logger.info("Finding popular songs")

    const currentYear = new Date().getFullYear()
    return this.generatePlaylistSuggestions({
      popularity: "high",
      yearRange: {
        start: currentYear - 1,
        end: currentYear,
      },
    })
  }

  async findPopularArtists(): Promise<Artist[]> {
    this.logger.info("Finding popular artists")

    try {
      const result = await this.generatePlaylistSuggestions({
        popularity: "high",
      })

      const uniqueArtists = [...new Set(result.songs.map((song) => song.artist))]

      this.logger.debug("Analyzing top artists", {
        count: uniqueArtists.length,
      })

      const artistAnalyses = await Promise.all(
        uniqueArtists.slice(0, 10).map(async (artist) => {
          try {
            return await this.musicAnalysisService.analyzeArtist(artist)
          } catch (error) {
            this.logger.error("Error analyzing artist", error, { artist })
            return null
          }
        })
      )

      const validArtists = artistAnalyses.filter((a): a is Artist => a !== null)

      this.logger.info("Popular artists analysis completed", {
        count: validArtists.length,
      })

      return validArtists
    } catch (error) {
      this.logger.error("Error finding popular artists", error)
      throw error
    }
  }

  async findSongsByGenre(genre: string): Promise<GenerationResult> {
    this.logger.info("Finding songs by genre", { genre })
    return this.generatePlaylistSuggestions({ genres: [genre] })
  }

  async findSongsByMood(mood: string): Promise<GenerationResult> {
    this.logger.info("Finding songs by mood", { mood })
    return this.generatePlaylistSuggestions({ mood })
  }

  async findSongsByTempo(tempo: "slow" | "medium" | "fast"): Promise<GenerationResult> {
    this.logger.info("Finding songs by tempo", { tempo })
    return this.generatePlaylistSuggestions({ tempo })
  }

  async findSongsByYear(year: number): Promise<GenerationResult> {
    this.logger.info("Finding songs by year", { year })
    return this.generatePlaylistSuggestions({
      yearRange: { start: year, end: year },
    })
  }

  async analyzeMusicTrend(genre: string): Promise<MusicTrend> {
    this.logger.info("Analyzing music trend", { genre })

    try {
      const cached = this.cacheService.get<MusicTrend>({
        type: "trend",
        criteria: { genre },
      })

      if (cached) {
        this.logger.debug("Returning cached trend analysis", { genre })
        return cached
      }

      this.logger.debug("Performing new trend analysis", { genre })
      const trend = await this.musicAnalysisService.analyzeTrend(genre)

      this.logger.debug("Caching trend analysis", { genre })
      this.cacheService.set(
        {
          type: "trend",
          criteria: { genre },
        },
        trend
      )

      return trend
    } catch (error) {
      this.logger.error("Error analyzing music trend", error, { genre })
      throw error
    }
  }

  async generateMixedPlaylist(
    songs: { title: string; artist: string }[]
  ): Promise<GenerationResult> {
    this.logger.info("Generating mixed playlist", {
      songsCount: songs.length,
    })

    try {
      this.logger.debug("Analyzing input songs")
      const analyses = await Promise.all(
        songs.map(async (song) => {
          try {
            return await this.analyzeSong(song.title, song.artist)
          } catch (error) {
            this.logger.error("Error analyzing song for mixed playlist", error, song)
            return null
          }
        })
      )

      const validAnalyses = analyses.filter((a): a is SongAnalysis => a !== null)

      const commonFeatures = {
        genres: [...new Set(validAnalyses.flatMap((a) => a.features.genre))],
        mood: [...new Set(validAnalyses.flatMap((a) => a.features.mood))],
        tempo:
          validAnalyses.reduce((sum, a) => sum + a.features.tempo, 0) /
          validAnalyses.length,
      }

      this.logger.debug("Extracted common features", commonFeatures)

      return this.generatePlaylistSuggestions({
        genres: commonFeatures.genres,
        mood: commonFeatures.mood[0],
        tempo:
          commonFeatures.tempo > 120
            ? "fast"
            : commonFeatures.tempo < 80
              ? "slow"
              : "medium",
      })
    } catch (error) {
      this.logger.error("Error generating mixed playlist", error, { songs })
      throw error
    }
  }

  async findTrendingInGenre(genre: string): Promise<{
    songs: Song[]
    artists: Artist[]
    trend: MusicTrend
  }> {
    this.logger.info("Finding trending content in genre", { genre })

    try {
      const trend = await this.analyzeMusicTrend(genre)

      this.logger.debug("Analyzing trending artists", {
        artistCount: trend.recentArtists.length,
      })

      const artists = await Promise.all(
        trend.recentArtists.slice(0, 5).map(async (artist) => {
          try {
            return await this.musicAnalysisService.analyzeArtist(artist)
          } catch (error) {
            this.logger.error("Error analyzing trending artist", error, { artist })
            return null
          }
        })
      )

      const validArtists = artists.filter((a): a is Artist => a !== null)

      this.logger.debug("Finding songs for genre")
      const playlistResult = await this.findSongsByGenre(genre)

      const result = {
        songs: playlistResult.songs,
        artists: validArtists,
        trend,
      }

      this.logger.info("Completed trending analysis", {
        songsCount: result.songs.length,
        artistsCount: result.artists.length,
      })

      return result
    } catch (error) {
      this.logger.error("Error finding trending content", error, { genre })
      throw error
    }
  }

  // Méthodes Spotify
  async generateEnhancedPlaylist(criteria: PlaylistCriteria): Promise<{
    suggestions: GenerationResult
    spotifyTracks?: SpotifyApi.TrackObjectFull[]
  }> {
    this.logger.info("Generating enhanced playlist", { criteria })
    try {
      const suggestions = await this.generatePlaylistSuggestions(criteria)

      if (!this.spotifyService) {
        this.logger.warn("Spotify service not enabled, returning basic suggestions")
        return { suggestions }
      }

      if (!suggestions?.songs.length) {
        this.logger.warn("No songs in suggestions")
        return { suggestions }
      }

      this.logger.debug("Searching Spotify tracks", {
        songsCount: suggestions.songs.length,
      })

      const spotifyTrackPromises = suggestions.songs.map(async (song) => {
        try {
          const results = await this.spotifyService!.searchTracks(
            `track:${song.title} artist:${song.artist}`,
            1
          )
          return results?.[0]
        } catch (error) {
          this.logger.error(`Error searching for track: ${song.title}`, error)
          return null
        }
      })

      const spotifyTracks = await Promise.all(spotifyTrackPromises)

      try {
        const spotifyRecommendations =
          await this.spotifyService.getRecommendations(criteria)

        const allTracks = [...spotifyTracks, ...(spotifyRecommendations || [])].filter(
          (track): track is SpotifyApi.TrackObjectFull => !!track
        )

        return {
          suggestions,
          spotifyTracks: allTracks,
        }
      } catch (error) {
        this.logger.error("Error getting Spotify recommendations:", error)
        return {
          suggestions,
          spotifyTracks: spotifyTracks.filter(
            (track): track is SpotifyApi.TrackObjectFull => !!track
          ),
        }
      }
    } catch (error) {
      this.logger.error("Spotify integration error:", error)
      return {
        suggestions: {
          songs: [],
          explanation: "Failed to generate suggestions",
          tags: [],
        },
      }
    }
  }

  async saveToSpotify(
    userId: string,
    playlistName: string,
    tracks: SpotifyApi.TrackObjectFull[]
  ): Promise<string> {
    this.logger.info("Saving playlist to Spotify", {
      userId,
      playlistName,
      tracksCount: tracks.length,
    })
    if (!this.spotifyService) {
      const error = new Error("Spotify integration not enabled")
      this.logger.error("failed to save playlist to Spotify", error)
      throw error
    }

    try {
      const playlistId = await this.spotifyService.createPlaylist(
        userId,
        playlistName,
        tracks.map((track) => track.id)
      )

      this.logger.info("Playlist saved successfully", {
        userId,
        playlistName,
        playlistId,
      })

      return playlistId
    } catch (error) {
      this.logger.error("Error saving playlist to Spotify", error, {
        userId,
        playlistName,
        tracksCount: tracks.length,
      })
      throw error
    }
  }

  async analyzeUserTaste(
    timeRange: "short_term" | "medium_term" | "long_term" = "medium_term"
  ): Promise<{
    topTracks: SpotifyApi.TrackObjectFull[]
    audioFeatures: SpotifyApi.AudioFeaturesObject[]
    analysis: {
      preferredGenres: string[]
      averageEnergy: number
      averageDanceability: number
      tempoDistribution: {
        slow: number
        medium: number
        fast: number
      }
      moodProfile: {
        happy: number
        sad: number
        energetic: number
        calm: number
      }
    }
  }> {
    this.logger.info("Analyzing user taste", { timeRange })

    if (!this.spotifyService) {
      const error = new Error("Spotify integration not enabled")
      this.logger.error("Failed to analyze user taste", error)
      throw error
    }

    const CacheKey = {
      type: "user_taste_analysis",
      criteria: { timeRange },
    }

    const cached = this.cacheService.get(CacheKey)
    if (cached) {
      this.logger.debug("Returning cached user taste analysis", {
        timeRange,
        tracksCount: cached.topTracks.length,
      })
      return cached
    }

    console.log("Starting user taste analysis...")

    try {
      this.logger.debug(`Fetching top tracks for ${timeRange}`)
      const topTracks = await this.spotifyService.getUserTopTracks(timeRange, 50)
      this.logger.debug("Top tracks fetched", { count: topTracks.length })

      if (topTracks.length === 0) {
        this.logger.warn("No top tracks found, returning default analysis")
        return this.getDefaultAnalysis()
      }

      this.logger.debug("Fetching audio features for tracks")
      const audioFeatures = await Promise.all(
        topTracks.map((track) => {
          this.logger.debug("Getting features for track", {
            trackName: track.name,
            trackId: track.id,
          })
          return this.spotifyService!.getTrackFeatures(track.id)
        })
      )
      this.logger.debug("Analyzing audio features", {
        featuresCount: audioFeatures.length,
      })

      // Initialiser les compteurs
      let slow = 0,
        medium = 0,
        fast = 0
      let happy = 0,
        sad = 0,
        energetic = 0,
        calm = 0
      const totalTracks = audioFeatures.length || 1

      audioFeatures.forEach((features) => {
        // Tempo distribution
        if (features.tempo < 100) slow++
        else if (features.tempo < 130) medium++
        else fast++

        // Mood profile
        if (features.valence > 0.6) happy++
        if (features.valence < 0.4) sad++
        if (features.energy > 0.6) energetic++
        if (features.energy < 0.4) calm++
      })

      this.logger.debug("Extracting genres from tracks")
      const genres = await this.extractGenresFromTracks(topTracks)
      this.logger.debug("Genres extracted", {
        uniqueGenresCount: genres.length,
      })

      const analysis = {
        preferredGenres: genres,
        averageEnergy: this.average(audioFeatures.map((f) => f.energy)),
        averageDanceability: this.average(audioFeatures.map((f) => f.danceability)),
        tempoDistribution: {
          slow: slow / totalTracks,
          medium: medium / totalTracks,
          fast: fast / totalTracks,
        },
        moodProfile: {
          happy: happy / totalTracks,
          sad: sad / totalTracks,
          energetic: energetic / totalTracks,
          calm: calm / totalTracks,
        },
      }

      const result = {
        topTracks,
        audioFeatures,
        analysis,
      }
      this.logger.info("User taste analysis completed successfully")
      return result
    } catch (error) {
      this.logger.error("Error in analyzeUserTaste", error, { timeRange })
      return this.getDefaultAnalysis()
    }
  }

  private getDefaultAnalysis() {
    return {
      topTracks: [],
      audioFeatures: [],
      analysis: {
        preferredGenres: [],
        averageEnergy: 0,
        averageDanceability: 0,
        tempoDistribution: {
          slow: 0,
          medium: 0,
          fast: 0,
        },
        moodProfile: {
          happy: 0,
          sad: 0,
          energetic: 0,
          calm: 0,
        },
      },
    }
  }

  // Méthode utilitaire pour extraire les genres
  private async extractGenresFromTracks(
    tracks: SpotifyApi.TrackObjectFull[]
  ): Promise<string[]> {
    if (!this.spotifyService) {
      return []
    }

    try {
      // Récupérer les IDs d'artistes uniques
      const artistIds = [
        ...new Set(tracks.flatMap((track) => track.artists.map((artist) => artist.id))),
      ]

      // Récupérer les détails des artistes
      const artists = await Promise.all(
        artistIds.map((id) => this.spotifyService!.getArtist(id))
      )

      // Compter les occurrences des genres
      const genreCounts = new Map<string, number>()
      artists.forEach((artist) => {
        artist.genres?.forEach((genre) => {
          genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)
        })
      })

      // Trier les genres par popularité
      return Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([genre]) => genre)
    } catch (error) {
      console.error("Error extracting genres:", error)
      return []
    }
  }

  private average(numbers: number[]): number {
    if (!numbers.length) return 0
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length
  }

  async generatePersonalizedPlaylist(userId: string): Promise<GenerationResult> {
    this.logger.info("Generating personalized playlist", { userId })

    if (!this.spotifyService) {
      const error = new Error("Spotify integration not enabled")
      this.logger.error("Failed to generate personalized playlist", error)
      throw error
    }

    try {
      // Analyser les goûts de l'utilisateur
      this.logger.debug("Analyzing user taste for personalization")
      const userTaste = await this.analyzeUserTaste()

      // Créer des critères basés sur l'analyse
      const criteria: PlaylistCriteria = {
        genres: userTaste.analysis.preferredGenres.slice(0, 3),
        tempo: this.determinePreferredTempo(userTaste.analysis.tempoDistribution),
        mood: this.determinePreferredMood(userTaste.analysis.moodProfile),
      }

      this.logger.debug("Generated playlist criteria from taste analysis", criteria)

      // Générer une playlist basée sur ces critères
      return this.generatePlaylistSuggestions(criteria)
    } catch (error) {
      this.logger.error("Error generating personalized playlist", error, { userId })
      throw error
    }
  }

  private extractGenres(tracks: SpotifyApi.TrackObjectFull[]): string[] {
    const genreCounts = new Map<string, number>()

    tracks.forEach((track) => {
      track.artists.forEach((artist) => {
        if ("genres" in artist) {
          const genres = (artist as SpotifyApi.ArtistObjectFull).genres || []
          genres.forEach((genre) => {
            genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)
          })
        }
      })
    })

    return Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre)
  }

  private analyzeTempoDistribution(features: SpotifyApi.AudioFeaturesObject[]): {
    slow: number
    medium: number
    fast: number
  } {
    let slow = 0,
      medium = 0,
      fast = 0

    features.forEach((f) => {
      if (f.tempo < 100) slow++
      else if (f.tempo < 130) medium++
      else fast++
    })

    const total = features.length
    return {
      slow: slow / total,
      medium: medium / total,
      fast: fast / total,
    }
  }

  private analyzeMoodProfile(features: SpotifyApi.AudioFeaturesObject[]): {
    happy: number
    sad: number
    energetic: number
    calm: number
  } {
    let happy = 0,
      sad = 0,
      energetic = 0,
      calm = 0

    features.forEach((f) => {
      if (f.valence > 0.6) happy++
      if (f.valence < 0.4) sad++
      if (f.energy > 0.6) energetic++
      if (f.energy < 0.4) calm++
    })

    const total = features.length
    return {
      happy: happy / total,
      sad: sad / total,
      energetic: energetic / total,
      calm: calm / total,
    }
  }

  private determinePreferredTempo(distribution: {
    slow: number
    medium: number
    fast: number
  }): "slow" | "medium" | "fast" {
    const max = Math.max(distribution.slow, distribution.medium, distribution.fast)
    if (max === distribution.slow) return "slow"
    if (max === distribution.medium) return "medium"
    return "fast"
  }

  private determinePreferredMood(profile: {
    happy: number
    sad: number
    energetic: number
    calm: number
  }): string {
    const max = Math.max(profile.happy, profile.sad, profile.energetic, profile.calm)
    if (max === profile.happy) return "happy"
    if (max === profile.sad) return "sad"
    if (max === profile.energetic) return "energetic"
    return "calm"
  }

  clearCache(): void {
    this.cacheService.clear()
  }

  getCacheStats() {
    return this.cacheService.getStats()
  }

  getSpotifyAuthUrl(): string {
    if (!this.spotifyService) {
      throw new Error("Spotify integration not enabled")
    }
    return this.spotifyService.getAuthorizationUrl()
  }

  async handleSpotifyAuth(code: string): Promise<SpotifyAuthTokens> {
    if (!this.spotifyService) {
      throw new Error("Spotify integration not enabled")
    }
    const tokens = await this.spotifyService.getTokens(code)
    this.setSpotifyTokens(tokens)
    return tokens
  }

  setSpotifyTokens(tokens: SpotifyAuthTokens): void {
    if (!this.spotifyService) {
      throw new Error("Spotify integration not enabled")
    }
    this.spotifyService.setTokens(tokens)
  }

  async refreshSpotifyTokens(): Promise<SpotifyAuthTokens> {
    if (!this.spotifyService) {
      throw new Error("Spotify integration not enabled")
    }
    return this.spotifyService.refreshAccessToken()
  }
}
