import { OpenAIService } from "./services/openai"
import { MusicAnalysisService } from "./services/musicAnalysis"
import {
  PlaylistCriteria,
  GenerationResult,
  SongAnalysis,
  Artist,
  MusicTrend,
} from "./types"
import { CacheService } from "./services/cache"

export class PlaylistGenius {
  private openaiService: OpenAIService
  private musicAnalysisService: MusicAnalysisService
  private cacheService: CacheService

  constructor(private apiKey: string) {
    this.openaiService = new OpenAIService(apiKey)
    this.musicAnalysisService = new MusicAnalysisService(apiKey)
    this.cacheService = new CacheService()
  }

  // Méthode principale de génération de playlist
  async generatePlaylistSuggestions(
    criteria: PlaylistCriteria
  ): Promise<GenerationResult> {
    try {
      // Vérifier le cache
      const cacheKey = `playlist_${JSON.stringify(criteria)}`
      const cached = this.cacheService.get({ type: "playlist", id: cacheKey })
      if (cached) return cached as GenerationResult

      // Générer les suggestions
      const result = await this.openaiService.getPlaylistSuggestions(criteria)

      // Stocker dans le cache
      this.cacheService.set({ type: "playlist", id: cacheKey }, result)

      return result
    } catch (error) {
      console.error("Error generating playlist:", error)
      throw new Error("Failed to generate playlist suggestions")
    }
  }

  // Analyse de chanson
  async analyzeSong(title: string, artist: string): Promise<SongAnalysis> {
    const cached = this.cacheService.get<SongAnalysis>({
      type: "song_analysis",
      criteria: { title, artist },
    })

    if (cached) return cached

    // Utilisation de la méthode spécifique pour l'analyse détaillée
    const analysis = await this.openaiService.analyzeSongDetailed(title, artist)

    this.cacheService.set(
      {
        type: "song_analysis",
        criteria: { title, artist },
      },
      analysis
    )

    return analysis
  }

  // Recherche de chansons similaires
  async findSimilarSongs(song: {
    title: string
    artist: string
  }): Promise<SongAnalysis[]> {
    const analysis = await this.analyzeSong(song.title, song.artist)
    const similarSongs = await Promise.all(
      analysis.similarSongs.map(async (songString) => {
        const [title, artist] = songString.split(" by ")
        return this.analyzeSong(title, artist)
      })
    )
    return similarSongs
  }

  // Recherche d'artistes similaires
  async findSimilarArtists(artist: string): Promise<Artist[]> {
    const cacheKey = `similar_artists_${artist}`
    const cached = this.cacheService.get({ type: "similar_artists", id: cacheKey })
    if (cached) return cached as Artist[]

    const artistAnalysis = await this.musicAnalysisService.analyzeArtist(artist)
    const similarArtists = await Promise.all(
      artistAnalysis.similarArtists.map((name) =>
        this.musicAnalysisService.analyzeArtist(name)
      )
    )

    this.cacheService.set({ type: "similar_artists", id: cacheKey }, similarArtists)
    return similarArtists
  }

  // Recherche des chansons populaires
  async findPopularSongs(): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({
      popularity: "high",
      yearRange: {
        start: new Date().getFullYear() - 1,
        end: new Date().getFullYear(),
      },
    })
  }

  // Recherche des artistes populaires
  async findPopularArtists(): Promise<Artist[]> {
    const result = await this.generatePlaylistSuggestions({
      popularity: "high",
    })

    const uniqueArtists = [...new Set(result.songs.map((song) => song.artist))]
    return Promise.all(
      uniqueArtists
        .slice(0, 10)
        .map((artist) => this.musicAnalysisService.analyzeArtist(artist))
    )
  }

  // Recherche par genre
  async findSongsByGenre(genre: string): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({ genres: [genre] })
  }

  // Recherche par humeur
  async findSongsByMood(mood: string): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({ mood })
  }

  // Recherche par tempo
  async findSongsByTempo(tempo: string): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({
      tempo: tempo as "slow" | "medium" | "fast",
    })
  }

  // Recherche par année
  async findSongsByYear(year: number): Promise<GenerationResult> {
    return this.generatePlaylistSuggestions({
      yearRange: { start: year, end: year },
    })
  }

  // Analyse des tendances
  async analyzeMusicTrend(genre: string): Promise<MusicTrend> {
    const cacheKey = `trend_${genre}`
    const cached = this.cacheService.get({ type: "trend", id: cacheKey })
    if (cached) return cached as MusicTrend

    const trend = await this.musicAnalysisService.analyzeTrend(genre)
    this.cacheService.set({ type: "trend", id: cacheKey }, trend)
    return trend
  }

  // Génération de playlist mixte
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

  // Recherche des tendances par genre
  async findTrendingInGenre(genre: string): Promise<{
    songs: GenerationResult
    artists: Artist[]
    trend: MusicTrend
  }> {
    const trend = await this.analyzeMusicTrend(genre)
    const artists = await Promise.all(
      trend.recentArtists
        .slice(0, 5)
        .map((artist) => this.musicAnalysisService.analyzeArtist(artist))
    )

    const songs = await this.findSongsByGenre(genre)
    return { songs, artists, trend }
  }

  // Gestion du cache
  clearCache(): void {
    this.cacheService.clear()
  }

  getCacheStats() {
    return this.cacheService.getStats()
  }
}
