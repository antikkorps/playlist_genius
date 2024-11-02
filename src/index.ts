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
      this.spotifyService = new SpotifyService(spotifyCredentials)
    }
  }

  private assertSpotifyEnabled(): void {
    if (!this.spotifyService) {
      throw new Error(
        "This feature requires Spotify credentials. Please initialize PlaylistGenius with Spotify credentials."
      )
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

  async generateEnhancedPlaylist(criteria: PlaylistCriteria): Promise<{
    suggestions: GenerationResult
    spotifyTracks?: SpotifyApi.TrackObjectFull[]
  }> {
    // Obtenir les suggestions de l'IA
    const suggestions = await this.generatePlaylistSuggestions(criteria)

    if (!this.spotifyService) {
      return { suggestions }
    }

    try {
      // Rechercher les chansons sur Spotify
      const spotifyTracks = await Promise.all(
        suggestions.songs.map(async (song) => {
          const results = await this.spotifyService!.searchTracks(
            `track:${song.title} artist:${song.artist}`,
            1
          )
          return results[0]
        })
      )

      // Obtenir des recommendations supplémentaires de Spotify
      const spotifyRecommendations =
        await this.spotifyService.getRecommendations(criteria)

      // Combiner les résultats et filtrer les undefined
      const allTracks = [...spotifyTracks, ...spotifyRecommendations].filter(
        (track): track is SpotifyApi.TrackObjectFull => !!track
      )

      return {
        suggestions,
        spotifyTracks: allTracks,
      }
    } catch (error) {
      console.error("Spotify integration error:", error)
      return { suggestions }
    }
  }

  async saveToSpotify(
    userId: string,
    playlistName: string,
    tracks: SpotifyApi.TrackObjectFull[]
  ): Promise<string> {
    this.assertSpotifyEnabled()
    return this.spotifyService!.createPlaylist(
      userId,
      playlistName,
      tracks.map((track) => track.id)
    )
  }

  // Nouvelles méthodes utilisant Spotify

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
    this.assertSpotifyEnabled()

    const topTracks = await this.spotifyService!.getUserTopTracks(timeRange)
    const audioFeatures = await Promise.all(
      topTracks.map((track) => this.spotifyService!.getTrackFeatures(track.id))
    )

    // Analyser les caractéristiques
    const analysis = {
      preferredGenres: this.extractGenres(topTracks),
      averageEnergy: this.average(audioFeatures.map((f) => f.energy)),
      averageDanceability: this.average(audioFeatures.map((f) => f.danceability)),
      tempoDistribution: this.analyzeTempoDistribution(audioFeatures),
      moodProfile: this.analyzeMoodProfile(audioFeatures),
    }

    return {
      topTracks,
      audioFeatures,
      analysis,
    }
  }

  async generatePersonalizedPlaylist(userId: string): Promise<GenerationResult> {
    this.assertSpotifyEnabled()

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

  // Méthodes utilitaires privées

  private average(numbers: number[]): number {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length
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
}
