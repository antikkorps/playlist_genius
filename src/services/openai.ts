import OpenAI from "openai"
import {
  PlaylistCriteria,
  GenerationResult,
  SongAnalysis,
  CustomPromptOptions,
} from "../types"

export class OpenAIService {
  private openai: OpenAI
  private model: string = "gpt-3.5-turbo"

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
    try {
      const prompt = `Generate a playlist with 5 songs matching these criteria:
      ${this.formatCriteria(criteria)}
      
      Return a JSON object with this exact structure:
      {
        "songs": [
          {
            "title": "Song Name",
            "artist": "Artist Name",
            "genre": ["main genre", "sub genre"],
            "tempo": 120,
            "popularity": 85,
            "year": 2020,
            "duration": 180
          }
        ],
        "explanation": "Brief explanation of the selection",
        "tags": ["relevant", "tags"]
      }`

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

      // Assurer une structure de retour valide même en cas d'erreur
      return {
        songs: response.songs || [],
        explanation: response.explanation || "Playlist generated based on given criteria",
        tags: response.tags || [],
      }
    } catch (error) {
      console.error("Error generating playlist suggestions:", error)
      throw new Error("Failed to generate playlist suggestions")
    }
  }

  private formatCriteria(criteria: PlaylistCriteria): string {
    const parts = []

    if (criteria.genres?.length) {
      parts.push(`Genres: ${criteria.genres.join(", ")}`)
    }
    if (criteria.mood) {
      parts.push(`Mood: ${criteria.mood}`)
    }
    if (criteria.tempo) {
      parts.push(`Tempo: ${criteria.tempo}`)
    }
    if (criteria.popularity) {
      parts.push(`Popularity: ${criteria.popularity}`)
    }
    if (criteria.yearRange) {
      if (criteria.yearRange.start && criteria.yearRange.end) {
        parts.push(`Year range: ${criteria.yearRange.start} to ${criteria.yearRange.end}`)
      } else if (criteria.yearRange.start) {
        parts.push(`Year: from ${criteria.yearRange.start}`)
      } else if (criteria.yearRange.end) {
        parts.push(`Year: until ${criteria.yearRange.end}`)
      }
    }

    return parts.join("\n")
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

  async executeCustomPrompt(prompt: string, options: CustomPromptOptions = {}) {
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: options.systemPrompt || "You are a music expert assistant.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens,
      response_format: options.format === "json" ? { type: "json_object" } : undefined,
    })

    return options.format === "json"
      ? JSON.parse(completion.choices[0].message.content || "{}")
      : completion.choices[0].message.content
  }
}
