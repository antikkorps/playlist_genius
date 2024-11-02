import { PlaylistGenius } from "../index"
import dotenv from "dotenv"

dotenv.config()

async function testPlaylistGenius() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Please set OPENAI_API_KEY in your .env file")
    process.exit(1)
  }

  const playlistGen = new PlaylistGenius(process.env.OPENAI_API_KEY)

  try {
    console.log("🎵 Testing PlaylistGenius...\n")

    // Test 1: Génération de playlist simple
    console.log("1. Generating rock playlist...")
    const rockPlaylist = await playlistGen.generatePlaylistSuggestions({
      genres: ["rock"],
      mood: "energetic",
      tempo: "fast",
    })
    console.log("Rock playlist generated:", rockPlaylist)
    console.log("\n-------------------\n")

    // Test 2: Analyse d'une chanson
    console.log("2. Analyzing Bohemian Rhapsody...")
    const songAnalysis = await playlistGen.analyzeSong("Bohemian Rhapsody", "Queen")
    console.log("Song analysis:", songAnalysis)
    console.log("\n-------------------\n")

    // Test 3: Recherche de chansons similaires
    console.log("3. Finding similar songs to Bohemian Rhapsody...")
    const similarSongs = await playlistGen.findSimilarSongs({
      title: "Bohemian Rhapsody",
      artist: "Queen",
    })
    console.log("Similar songs:", similarSongs)
    console.log("\n-------------------\n")

    // Test 4: Génération d'une playlist mixte
    console.log("4. Generating mixed playlist...")
    const mixedPlaylist = await playlistGen.generateMixedPlaylist([
      { title: "Bohemian Rhapsody", artist: "Queen" },
      { title: "Stairway to Heaven", artist: "Led Zeppelin" },
    ])
    console.log("Mixed playlist:", mixedPlaylist)
    console.log("\n-------------------\n")

    // Test 5: Analyse des tendances
    console.log("5. Analyzing rock music trends...")
    const trends = await playlistGen.analyzeMusicTrend("rock")
    console.log("Rock trends:", trends)
    console.log("\n-------------------\n")

    // Test 6: Test du cache
    console.log("6. Testing cache...")
    console.log("Making same request again (should be faster)...")
    const start = Date.now()
    const cachedPlaylist = await playlistGen.generatePlaylistSuggestions({
      genres: ["rock"],
      mood: "energetic",
      tempo: "fast",
    })
    console.log(`Time taken: ${Date.now() - start}ms`)
    console.log("Cache stats:", playlistGen.getCacheStats())
    console.log("\n-------------------\n")
  } catch (error) {
    console.error("Error during testing:", error)
  }
}

// Exécuter les tests
testPlaylistGenius()
