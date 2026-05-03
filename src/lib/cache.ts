interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private inflight = new Map<string, Promise<T>>();
  private ttl: number;
  private maxKeys: number;

  constructor(ttlMs: number, maxKeys = 64) {
    this.ttl = ttlMs;
    this.maxKeys = maxKeys;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.store.delete(key);
      return null;
    }
    // True LRU: move-to-end on read so a flood of unique-key fetches can't
    // evict legitimate hot entries. Map preserves insertion order, so
    // delete-then-set re-inserts at the tail (most-recently-used position).
    // Adversarial QA caught the previous FIFO behavior — 70 fake ownerIds
    // could push the legit "all" key off the bottom.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data;
  }

  set(key: string, data: T): void {
    if (this.store.has(key)) {
      // Re-set: drop stale slot first so the new entry lands at the tail.
      this.store.delete(key);
    } else if (this.store.size >= this.maxKeys) {
      // Capacity hit: evict the least-recently-used (head of insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { data, timestamp: Date.now() });
  }

  // Dedupe concurrent identical fetches. If a build for `key` is already in
  // flight, return the same promise instead of starting a second one. This
  // prevents 10x parallel HubSpot hits when multiple clients (or refresh
  // bursts) race a cold cache.
  async getOrBuild(key: string, build: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = build()
      .then((data) => {
        this.set(key, data);
        return data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, p);
    return p;
  }
}
