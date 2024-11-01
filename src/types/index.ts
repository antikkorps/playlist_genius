export interface PlaylistCriteria {
  genres?: string[]
  mood?: string
  tempo?: "slow" | "medium" | "fast"
  popularity?: "low" | "medium" | "high"
  similarArtists?: string[]
  duration?: number // en minutes
  excludedArtists?: string[]
  yearRange?: {
    start?: number
    end?: number
  }
}

export interface Song {
  title: string
  artist: string
  genre: string[]
  tempo: number
  popularity: number
  year: number
  duration: number
}

export interface GenerationResult {
  songs: Song[]
  explanation: string
  tags: string[]
}
