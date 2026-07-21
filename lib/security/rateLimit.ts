import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis/cloudflare";

type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

type Limiter = {
  limit: (identifier: string) => Promise<RateLimitResult>;
};

const memoryWindow = new Map<
  string,
  { count: number; resetAt: number; limit: number }
>();

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

function logRateLimitFallback(error: unknown, scope: string) {
  console.warn(`[rate-limit] Falling back to in-memory limiter for ${scope}.`, error);
}

function createFallbackLimiter(limit: number, durationMs: number): Limiter {
  return {
    async limit(identifier: string) {
      const key = `${limit}:${durationMs}:${identifier}`;
      const now = Date.now();
      const current = memoryWindow.get(key);

      if (!current || now > current.resetAt) {
        memoryWindow.set(key, {
          count: 1,
          resetAt: now + durationMs,
          limit,
        });

        return {
          success: true,
          limit,
          remaining: limit - 1,
          reset: now + durationMs,
        };
      }

      current.count += 1;

      return {
        success: current.count <= limit,
        limit,
        remaining: Math.max(limit - current.count, 0),
        reset: current.resetAt,
      };
    },
  };
}

function createLimiter(limit: number, duration: `${number} s` | `${number} m` | `${number} h`) {
  const unit = duration.endsWith("h")
    ? 60 * 60 * 1000
    : duration.endsWith("m")
      ? 60 * 1000
      : 1000;
  const amount = Number.parseInt(duration, 10);
  const fallbackLimiter = createFallbackLimiter(limit, amount * unit);

  if (!redis) {
    return fallbackLimiter;
  }

  const upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, duration),
    analytics: true,
    prefix: `second-brain:${limit}:${duration}`,
  });

  return {
    async limit(identifier: string) {
      try {
        return await upstashLimiter.limit(identifier);
      } catch (error) {
        logRateLimitFallback(error, `window ${limit}/${duration}`);
        return fallbackLimiter.limit(identifier);
      }
    },
  };
}

export const authRateLimiter = createLimiter(5, "15 m");
export const passwordResetLimiter = createLimiter(3, "1 h");
export const apiRateLimiter = createLimiter(100, "1 m");
export const searchRateLimiter = createLimiter(30, "1 m");
export const extractRateLimiter = createLimiter(20, "1 m");

export async function checkRateLimit(limiter: Limiter, identifier: string) {
  const result = await limiter.limit(identifier);

  if (!result.success) {
    const error = new Error("Too many requests.");
    Object.assign(error, { status: 429, details: result });
    throw error;
  }

  return result;
}

export async function trackLoginAttempt(
  userId: string,
  ip: string,
  success: boolean,
) {
  const key = `login-attempts:${userId}:${ip}`;

  const fallback = () => {
    const now = Date.now();
    const current = memoryWindow.get(key);

    if (success) {
      memoryWindow.delete(key);
      return { count: 0, lockedUntil: null as Date | null };
    }

    if (!current || now > current.resetAt) {
      memoryWindow.set(key, {
        count: 1,
        resetAt: now + 30 * 60 * 1000,
        limit: 5,
      });
      return { count: 1, lockedUntil: null as Date | null };
    }

    current.count += 1;

    return {
      count: current.count,
      lockedUntil:
        current.count >= 5 ? new Date(now + 30 * 60 * 1000) : null,
    };
  };

  if (!redis) {
    return fallback();
  }

  try {
    if (success) {
      await redis.del(key);
      return { count: 0, lockedUntil: null as Date | null };
    }

    const count = await redis.incr(key);
    await redis.expire(key, 30 * 60);

    return {
      count,
      lockedUntil: count >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null,
    };
  } catch (error) {
    logRateLimitFallback(error, "login attempts");
    return fallback();
  }
}

export async function resetLoginAttempts(userId: string, ip: string) {
  const key = `login-attempts:${userId}:${ip}`;

  if (!redis) {
    memoryWindow.delete(key);
    return;
  }

  try {
    await redis.del(key);
  } catch (error) {
    logRateLimitFallback(error, "reset login attempts");
    memoryWindow.delete(key);
  }
}

export async function isAccountLocked(userId: string, ip: string) {
  const key = `login-attempts:${userId}:${ip}`;

  if (!redis) {
    const current = memoryWindow.get(key);
    return Boolean(current && current.count >= 5 && Date.now() < current.resetAt);
  }

  try {
    const count = Number((await redis.get<number>(key)) ?? 0);
    return count >= 5;
  } catch (error) {
    logRateLimitFallback(error, "account lock lookup");
    const current = memoryWindow.get(key);
    return Boolean(current && current.count >= 5 && Date.now() < current.resetAt);
  }
}
