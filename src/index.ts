import { OpenAIService } from "./services/openai"
import { MusicAnalysisService } from "./services/musicAnalysis"
import { CacheService } from "./services/cache"
import {
  PlaylistCriteria,
  GenerationResult,
  SongAnalysis,
  Artist,
  MusicTrend,
  Song,
} from "./types"

export class PlaylistGenius {
  private openaiService: OpenAIService
  private musicAnalysisService: MusicAnalysisService
  private cacheService: CacheService

  constructor(private apiKey: string) {
    this.openaiService = new OpenAIService(apiKey)
    this.musicAnalysisService = new MusicAnalysisService(apiKey)
    this.cacheService = new CacheService()
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
    const songAnalysis = await this.analyzeSong(song.title, song.artist)

    const similarSongsAnalyses = await Promise.all(
      songAnalysis.similarSongs.map(async (songString) => {
        const [title, artist] = songString.split(" by ").map((s) => s.trim())
        return this.analyzeSong(title, artist)
      })
    )

    return similarSongsAnalyses
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

  clearCache(): void {
    this.cacheService.clear()
  }

  getCacheStats() {
    return this.cacheService.getStats()
  }
}
