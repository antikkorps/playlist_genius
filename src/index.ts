import { OpenAIService } from "./services/openai"
import { PlaylistCriteria, GenerationResult } from "./types"

export class PlaylistGenius {
  private openaiService: OpenAIService

  constructor(private apiKey: string) {
    this.openaiService = new OpenAIService(apiKey)
  }

  async generatePlaylistSuggestions(
    criteria: PlaylistCriteria
  ): Promise<GenerationResult> {
    try {
      return await this.openaiService.getPlaylistSuggestions(criteria)
    } catch (error) {
      console.error("Error generating playlist:", error)
      throw new Error("Failed to generate playlist suggestions")
    }
  }

  async analyzeSong(title: string, artist: string): Promise<any> {
    // Implémentation à venir pour l'analyse des caractéristiques d'une chanson
    return {}
  }

  async findSimilarSongs(song: { title: string; artist: string }): Promise<any> {
    // Implémentation à venir pour trouver des chansons similaires
    return []
  }
}
