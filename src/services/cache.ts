import NodeCache from "node-cache"
import { PlaylistCriteria, GenerationResult, CacheOptions } from "../types"
import crypto from "crypto"

export class CacheService {
  private cache: NodeCache

  constructor(options: CacheOptions = {}) {
    this.cache = new NodeCache({
      stdTTL: options.stdTTL || 3600, // 1 heure par défaut
      checkperiod: options.checkperiod || 600, // Vérification toutes les 10 minutes
      maxKeys: options.maxKeys || 1000,
      useClones: false, // Pour des raisons de performance
    })
  }

  private generateCacheKey(criteria: PlaylistCriteria): string {
    const sortedCriteria = Object.entries(criteria)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce(
        (obj, [key, value]) => {
          if (Array.isArray(value)) {
            obj[key] = [...value].sort()
          } else {
            obj[key] = value
          }
          return obj
        },
        {} as Record<string, any>
      )

    return crypto
      .createHash("sha256")
      .update(JSON.stringify(sortedCriteria))
      .digest("hex")
  }

  // Récupère un résultat du cache
  get(criteria: PlaylistCriteria): GenerationResult | undefined {
    const key = this.generateCacheKey(criteria)
    return this.cache.get<GenerationResult>(key)
  }

  // Stocke un résultat dans le cache
  set(criteria: PlaylistCriteria, result: GenerationResult): void {
    const key = this.generateCacheKey(criteria)
    this.cache.set(key, result)
  }

  // Invalide une entrée spécifique
  invalidate(criteria: PlaylistCriteria): void {
    const key = this.generateCacheKey(criteria)
    this.cache.del(key)
  }

  // Vide tout le cache
  clear(): void {
    this.cache.flushAll()
  }

  // Obtient des statistiques sur le cache
  getStats() {
    return {
      keys: this.cache.keys().length,
      hits: this.cache.getStats().hits,
      misses: this.cache.getStats().misses,
      ksize: this.cache.getStats().ksize,
      vsize: this.cache.getStats().vsize,
    }
  }
}
