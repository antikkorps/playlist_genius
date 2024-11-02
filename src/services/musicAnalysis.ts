import { OpenAI } from "openai"
import { SongAnalysis, Artist, MusicTrend } from "../types"

export class MusicAnalysisService {
  private openai: OpenAI

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey })
  }

  private async analyzeWithAI(prompt: string): Promise<any> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a music expert with deep knowledge of music theory, history, and cultural impact. Provide detailed analysis based on the given prompt.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    })

    return JSON.parse(completion.choices[0].message.content || "{}")
  }

  async analyzeSong(title: string, artist: string): Promise<SongAnalysis> {
    const prompt = `Analyze the song "${title}" by ${artist} and provide:
    - Musical features (genre, mood, tempo, energy, etc.)
    - Thematic elements
    - Cultural impact
    - Similar songs
    Return as JSON with these categories.`

    const analysis = await this.analyzeWithAI(prompt)
    return analysis as SongAnalysis
  }

  async analyzeArtist(name: string): Promise<Artist> {
    const prompt = `Analyze the artist "${name}" and provide:
    - Main genres
    - Popularity metrics
    - Top tracks
    - Similar artists
    - Era and cultural context
    - Brief description
    Return as JSON with these categories.`

    const analysis = await this.analyzeWithAI(prompt)
    return analysis as Artist
  }

  async analyzeTrend(genre: string): Promise<MusicTrend> {
    const prompt = `Analyze the current trend for "${genre}" music and provide:
    - Current popularity
    - Recent notable artists and songs
    - Growth rate estimation
    - Future prediction
    Return as JSON with these categories.`

    const analysis = await this.analyzeWithAI(prompt)
    return analysis as MusicTrend
  }
}
