/** Fixed-window rate limiter (in memory, per process). */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.reset < now) {
      // Evict only expired windows, so a flood of new keys cannot reset active lockouts.
      if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    entry.n++;
    return entry.n <= this.max;
  }
}

const holder = globalThis as unknown as { __larpLimits?: Record<string, RateLimiter> };
holder.__larpLimits ??= {
  login: new RateLimiter(10, 15 * 60_000),
  signup: new RateLimiter(5, 60 * 60_000),
  suggest: new RateLimiter(5, 60 * 60_000),
  oauthRegister: new RateLimiter(20, 60 * 60_000),
  push: new RateLimiter(30, 60 * 60_000),
  pushTest: new RateLimiter(5, 60 * 60_000),
  places: new RateLimiter(60, 60 * 60_000),
};
export const limits = holder.__larpLimits;
