export interface PlaylistCriteria {
  genres?: string[]
  mood?: string
  tempo?: "slow" | "medium" | "fast"
  popularity?: "low" | "medium" | "high"
  type?: string
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

export interface TrendingResult {
  songs: Song[]
  artists: Artist[]
  trend: MusicTrend
}

// Methods interfaces
export interface SongAnalysis {
  title: string
  artist: string
  features: {
    genre: string[]
    mood: string[]
    tempo: number
    energy: number
    danceability: number
    valence: number
    acousticness: number
    instrumentalness: number
    popularity: number
    year: number
    key: string
    timeSignature: string
  }
  themes: string[]
  similarSongs: string[]
  culturalImpact?: string
}

export interface Artist {
  name: string
  genres: string[]
  popularity: number
  monthlyListeners?: number
  topTracks: string[]
  similarArtists: string[]
  era: string[]
  description: string
}

export interface MusicTrend {
  genre: string
  popularity: number
  recentArtists: string[]
  recentSongs: string[]
  growthRate: number
  prediction: string
}

// Cache Options
export interface CacheOptions {
  stdTTL?: number // Durée de vie en secondes
  checkperiod?: number // Période de vérification pour le nettoyage
  maxKeys?: number // Nombre maximum d'entrées
}

export interface CacheKey {
  type: string
  criteria: PlaylistCriteria | Record<string, any>
}

// Spotify Types
export interface SpotifyCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface SpotifyAuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: Array<{
    id: string
    name: string
  }>
  album: {
    id: string
    name: string
    release_date: string
  }
  duration_ms: number
  popularity: number
  preview_url: string | null
  external_urls: {
    spotify: string
  }
}

export interface SpotifyArtist {
  id: string
  name: string
  genres: string[]
  popularity: number
  followers: {
    total: number
  }
  external_urls: {
    spotify: string
  }
}

export interface SpotifyAudioFeatures {
  danceability: number
  energy: number
  key: number
  loudness: number
  mode: number
  speechiness: number
  acousticness: number
  instrumentalness: number
  liveness: number
  valence: number
  tempo: number
  time_signature: number
}
