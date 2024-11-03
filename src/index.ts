import { CacheKey } from "./types/index"
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
} from "./types"

export class PlaylistGenius {
  private openaiService: OpenAIService
  private musicAnalysisService: MusicAnalysisService
  private cacheService: CacheService
  private spotifyService?: SpotifyService

  constructor(
    private apiKey: string,
    spotifyCredentials?: SpotifyCredentials
  ) {
    this.openaiService = new OpenAIService(apiKey)
    this.musicAnalysisService = new MusicAnalysisService(apiKey)
    this.cacheService = new CacheService()

    if (spotifyCredentials) {
      this.spotifyService = new SpotifyService(spotifyCredentials, this.cacheService)
    }
  }

  async generatePlaylistSuggestions(
    criteria: PlaylistCriteria
  ): Promise<GenerationResult> {
    try {
      const cached = this.cacheService.get<GenerationResult>({
        type: "playlist",
        criteria,
      })

      if (cached) return cached

      const result = await this.openaiService.getPlaylistSuggestions(criteria)

      this.cacheService.set(
        {
          type: "playlist",
          criteria,
        },
        result
      )

      return result
    } catch (error) {
      console.error("Error generating playlist:", error)
      throw new Error("Failed to generate playlist suggestions")
    }
  }

  async analyzeSong(title: string, artist: string): Promise<SongAnalysis> {
    const cached = this.cacheService.get<SongAnalysis>({
      type: "song_analysis",
      criteria: { title, artist },
    })

    if (cached) return cached

    const analysis = await this.musicAnalysisService.analyzeSong(title, artist)

    this.cacheService.set(
      {
        type: "song_analysis",
        criteria: { title, artist },
      },
      analysis
    )

    return analysis
  }

  async findSimilarSongs(song: {
    title: string
    artist: string
  }): Promise<SongAnalysis[]> {
    try {
      const songAnalysis = await this.analyzeSong(song.title, song.artist)

      if (!songAnalysis?.similarSongs) {
        console.log("No similar songs found")
        return []
      }

      const similarSongsAnalyses = await Promise.all(
        songAnalysis.similarSongs.map(async (songString) => {
          try {
            const [title, artist] = songString.split(" by ").map((s) => s.trim())
            if (!title || !artist) {
              console.log(`Invalid song format: ${songString}`)
              return null
            }
            return await this.analyzeSong(title, artist)
          } catch (error) {
            console.error(`Error analyzing similar song: ${songString}`, error)
            return null
          }
        })
      )

      return similarSongsAnalyses.filter(
        (analysis): analysis is SongAnalysis => analysis !== null
      )
    } catch (error) {
      console.error("Error finding similar songs:", error)
      return []
    }
  }

  async findSimilarArtists(artist: string): Promise<Artist[]> {
    const cached = this.cacheService.get<Artist[]>({
      type: "similar_artists",
      criteria: { artist },
    })

    if (cached) return cached

    const artistAnalysis = await this.musicAnalysisService.analyzeArtist(artist)
    const similarArtists = await Promise.all(
      artistAnalysis.similarArtists.map((name) =>
        this.musicAnalysisService.analyzeArtist(name)
      )
    )

    this.cacheService.set(
      {
        type: "similar_artists",
        criteria: { artist },
      },
      similarArtists
    )

    return similarArtists
  }

  async findPopularSongs(): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({
      popularity: "high",
      yearRange: {
        start: new Date().getFullYear() - 1,
        end: new Date().getFullYear(),
      },
    })
  }

  async findPopularArtists(): Promise<Artist[]> {
    const result = await this.generatePlaylistSuggestions({
      popularity: "high",
    })

    const uniqueArtists = [...new Set(result.songs.map((song) => song.artist))]
    const artistAnalyses = await Promise.all(
      uniqueArtists
        .slice(0, 10)
        .map((artist) => this.musicAnalysisService.analyzeArtist(artist))
    )

    return artistAnalyses
  }

  async findSongsByGenre(genre: string): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({ genres: [genre] })
  }

  async findSongsByMood(mood: string): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({ mood })
  }

  async findSongsByTempo(tempo: "slow" | "medium" | "fast"): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({ tempo })
  }

  async findSongsByYear(year: number): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({
      yearRange: { start: year, end: year },
    })
  }

  async analyzeMusicTrend(genre: string): Promise<MusicTrend> {
    const cached = this.cacheService.get<MusicTrend>({
      type: "trend",
      criteria: { genre },
    })

    if (cached) return cached

    const trend = await this.musicAnalysisService.analyzeTrend(genre)

    this.cacheService.set(
      {
        type: "trend",
        criteria: { genre },
      },
      trend
    )

    return trend
  }

  async generateMixedPlaylist(
    songs: { title: string; artist: string }[]
  ): Promise<GenerationResult> {
    const analyses = await Promise.all(
      songs.map((song) => this.analyzeSong(song.title, song.artist))
    )

    const commonFeatures = {
      genres: [...new Set(analyses.flatMap((a) => a.features.genre))],
      mood: [...new Set(analyses.flatMap((a) => a.features.mood))],
      tempo: analyses.reduce((sum, a) => sum + a.features.tempo, 0) / analyses.length,
    }

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
  }

  async findTrendingInGenre(genre: string): Promise<{
    songs: Song[]
    artists: Artist[]
    trend: MusicTrend
  }> {
    const trend = await this.analyzeMusicTrend(genre)
    const artists = await Promise.all(
      trend.recentArtists
        .slice(0, 5)
        .map((artist) => this.musicAnalysisService.analyzeArtist(artist))
    )

    const playlistResult = await this.findSongsByGenre(genre)

    return {
      songs: playlistResult.songs,
      artists,
      trend,
    }
  }

  // Méthodes Spotify
  async generateEnhancedPlaylist(criteria: PlaylistCriteria): Promise<{
    suggestions: GenerationResult
    spotifyTracks?: SpotifyApi.TrackObjectFull[]
  }> {
    try {
      const suggestions = await this.generatePlaylistSuggestions(criteria)

      if (!this.spotifyService) {
        return { suggestions }
      }

      if (!suggestions?.songs) {
        console.log("No songs in suggestions")
        return { suggestions }
      }

      const spotifyTrackPromises = suggestions.songs.map(async (song) => {
        try {
          const results = await this.spotifyService!.searchTracks(
            `track:${song.title} artist:${song.artist}`,
            1
          )
          return results?.[0]
        } catch (error) {
          console.error(`Error searching for track: ${song.title}`, error)
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
        console.error("Error getting Spotify recommendations:", error)
        return {
          suggestions,
          spotifyTracks: spotifyTracks.filter(
            (track): track is SpotifyApi.TrackObjectFull => !!track
          ),
        }
      }
    } catch (error) {
      console.error("Spotify integration error:", error)
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
    if (!this.spotifyService) {
      throw new Error("Spotify integration not enabled")
    }
    return this.spotifyService.createPlaylist(
      userId,
      playlistName,
      tracks.map((track) => track.id)
    )
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
    if (!this.spotifyService) {
      throw new Error("Spotify integration not enabled")
    }

    const CacheKey = {
      type: "user_taste_analysis",
      criteria: { timeRange },
    }

    const cached = this.cacheService.get(CacheKey)
    if (cached) {
      return cached
    }

    console.log("Starting user taste analysis...")

    try {
      console.log(`Fetching top tracks for ${timeRange}...`)
      const topTracks = await this.spotifyService.getUserTopTracks(timeRange, 50)
      console.log(`Got ${topTracks.length} top tracks`)

      if (topTracks.length === 0) {
        console.log("Warning: No top tracks found")
        return this.getDefaultAnalysis()
      }

      console.log("Fetching audio features...")
      const audioFeatures = await Promise.all(
        topTracks.map((track) => {
          console.log(`Getting features for track: ${track.name}`)
          return this.spotifyService!.getTrackFeatures(track.id)
        })
      )
      console.log(`Got features for ${audioFeatures.length} tracks`)

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

      console.log("Extracting genres...")
      const genres = await this.extractGenresFromTracks(topTracks)
      console.log(`Found ${genres.length} unique genres`)

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

      return {
        topTracks,
        audioFeatures,
        analysis,
      }
    } catch (error) {
      console.error("Error in analyzeUserTaste:", error)
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
    if (!this.spotifyService) {
      throw new Error("Spotify integration not enabled")
    }

    // Analyser les goûts de l'utilisateur
    const userTaste = await this.analyzeUserTaste()

    // Créer des critères basés sur l'analyse
    const criteria: PlaylistCriteria = {
      genres: userTaste.analysis.preferredGenres.slice(0, 3),
      tempo: this.determinePreferredTempo(userTaste.analysis.tempoDistribution),
      mood: this.determinePreferredMood(userTaste.analysis.moodProfile),
    }

    // Générer une playlist basée sur ces critères
    return this.generatePlaylistSuggestions(criteria)
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
