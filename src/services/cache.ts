import NodeCache from "node-cache"
import { CacheKey } from "../types"
import crypto from "crypto"

export class CacheService {
  private cache: NodeCache

  constructor(options: NodeCache.Options = {}) {
    this.cache = new NodeCache({
      stdTTL: options.stdTTL || 3600,
      checkperiod: options.checkperiod || 600,
      maxKeys: options.maxKeys || 1000,
    })
  }

  private normalizeValue(value: any): any {
    if (Array.isArray(value)) {
      // Trie les tableaux pour assurer la cohérence quelle que soit leur ordre
      return [...value].sort()
    }
    if (typeof value === "object" && value !== null) {
      // Récursivement normalise les objets
      return Object.keys(value)
        .sort()
        .reduce((obj: any, key) => {
          obj[key] = this.normalizeValue(value[key])
          return obj
        }, {})
    }
    return value
  }

  private generateCacheKey(key: CacheKey): string {
    // Normalise la clé avant de la hasher
    const normalizedKey = {
      type: key.type,
      criteria: this.normalizeValue(key.criteria),
    }

    return crypto.createHash("sha256").update(JSON.stringify(normalizedKey)).digest("hex")
  }

  get<T = any>(key: CacheKey): T | undefined {
    const hashKey = this.generateCacheKey(key)
    return this.cache.get<T>(hashKey)
  }

  set<T = any>(key: CacheKey, value: T): void {
    const hashKey = this.generateCacheKey(key)
    this.cache.set(hashKey, value)
  }

  invalidate(key: CacheKey): void {
    const hashKey = this.generateCacheKey(key)
    this.cache.del(hashKey)
  }

  clear(): void {
    this.cache.flushAll()
  }

  getStats() {
    return this.cache.getStats()
  }
}
