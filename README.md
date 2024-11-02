# playlist_genius

Une librairie Node.js pour générer des playlists musicales intelligentes en utilisant l'IA.

## Installation

```bash
npm install playlist-genius
```

## Utilisation

```typescript
import { PlaylistGenius } from "playlist-genius"

const playlistGen = new PlaylistGenius(
  "votre-clé-api",
  {
    clientId: "votre-client-id-spotify",
    clientSecret: "votre-client-secret-spotify",
    redirectUri: "votre-redirect-uri",
  },
  {
    stdTTL: 7200, // Cache de 2 heures
    checkperiod: 600, // Nettoyage toutes les 10 minutes
    maxKeys: 500, // Maximum 500 entrées en cache
  }
)

// Générer des suggestions de playlist
const suggestions = await playlistGen.generatePlaylistSuggestions({
  genres: ["rock", "indie"],
  mood: "energetic",
  tempo: "fast",
})

// Générer une playlist enrichie avec Spotify
const enhancedPlaylist = await playlistGenius.generateEnhancedPlaylist({
  genres: ["rock"],
  mood: "energetic",
})

// Analyser les goûts d'un utilisateur
const userTaste = await playlistGenius.analyzeUserTaste("medium_term")
console.log("Genres préférés:", userTaste.analysis.preferredGenres)
console.log("Profil musical:", userTaste.analysis.moodProfile)

// Générer une playlist personnalisée basée sur les goûts
const personalizedPlaylist = await playlistGenius.generatePersonalizedPlaylist("user-id")

// Sauvegarder sur Spotify
if (enhancedPlaylist.spotifyTracks) {
  const playlistId = await playlistGenius.saveToSpotify(
    "user-id",
    "Ma Playlist Personnalisée",
    enhancedPlaylist.spotifyTracks
  )
}
// Voir les statistiques du cache
console.log(playlistGen.getCacheStats())

// Nettoyer le cache si nécessaire
playlistGen.clearCache()
```

## API

### PlaylistGenius

#### constructor(apiKey: string)

Crée une nouvelle instance de PlaylistGenius.

#### generatePlaylistSuggestions(criteria: PlaylistCriteria)

Génère des suggestions de playlists basées sur les critères fournis.

#### analyzeUserPreferences(playlistHistory: any[])

Analyse l'historique des playlists d'un utilisateur pour déterminer ses préférences.

## Licence

MIT
