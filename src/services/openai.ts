import OpenAI from "openai"
import { PlaylistCriteria, GenerationResult, SongAnalysis } from "../types"

export class OpenAIService {
  private openai: OpenAI

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey })
  }

  async generatePlaylistPrompt(criteria: PlaylistCriteria): Promise<string> {
    const elements = []

    if (criteria.genres?.length) {
      elements.push(`Genres: ${criteria.genres.join(", ")}`)
    }

    if (criteria.mood) {
      elements.push(`Mood: ${criteria.mood}`)
    }

    if (criteria.tempo) {
      elements.push(`Tempo: ${criteria.tempo}`)
    }

    if (criteria.similarArtists?.length) {
      elements.push(`Similar to artists: ${criteria.similarArtists.join(", ")}`)
    }

    return `Generate a cohesive playlist with the following criteria:
      ${elements.join("\n")}
      
      For each song, provide:
      - Title
      - Artist
      - Genre
      - Tempo (BPM)
      - Popularity (1-100)
      - Release Year
      - Duration (seconds)
      
      Format the response as a JSON array.`
  }

  async getPlaylistSuggestions(criteria: PlaylistCriteria): Promise<GenerationResult> {
    const prompt = await this.generatePlaylistPrompt(criteria)

    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a music expert with deep knowledge of various genres, artists, and music history. Generate personalized playlist suggestions based on user criteria.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    })

    const response = JSON.parse(completion.choices[0].message.content || "{}")

    return {
      songs: response.songs,
      explanation: response.explanation || "",
      tags: response.tags || [],
    }
  }

  async analyzeSongDetailed(title: string, artist: string): Promise<SongAnalysis> {
    const prompt = `Analyze the song "${title}" by ${artist} and provide detailed musical features including:
    - Genre categories
    - Mood descriptors
    - Technical aspects (tempo, key, time signature)
    - Musical characteristics (energy, danceability, etc.)
    - Themes
    - Similar songs
    - Cultural impact

    Format the response as a structured JSON matching the SongAnalysis interface.`

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a music expert providing detailed song analysis.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    })

    return JSON.parse(completion.choices[0].message.content || "{}") as SongAnalysis
  }
}
