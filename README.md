# playlist_genius

Une librairie Node.js pour générer des playlists musicales intelligentes en utilisant l'IA.

## Installation

```bash
npm install playlist-genius
```

## Utilisation

```typescript
import { PlaylistGenius } from "playlist-genius"

const playlistGen = new PlaylistGenius("votre-clé-api", {
  stdTTL: 7200, // Cache de 2 heures
  checkperiod: 600, // Nettoyage toutes les 10 minutes
  maxKeys: 500, // Maximum 500 entrées en cache
})

// Générer des suggestions de playlist
const suggestions = await playlistGen.generatePlaylistSuggestions({
  genres: ["rock", "indie"],
  mood: "energetic",
  tempo: "fast",
})

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
