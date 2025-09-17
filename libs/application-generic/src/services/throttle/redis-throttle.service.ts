import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { InMemoryProviderService } from '../in-memory-provider';
import { IThrottleReservationParams, IThrottleReservationResult } from './throttle.types';

const LOG_CONTEXT = 'RedisThrottleService';

@Injectable()
export class RedisThrottleService {
  private reserveScriptSha: string | null = null;
  private releaseScriptSha: string | null = null;
  private readonly ttlBufferMs: number;

  private readonly reserveScript = `
    -- KEYS[1] = setKey
    -- ARGV[1] = limit
    -- ARGV[2] = ttlSec
    -- ARGV[3] = jobId
    -- Returns: {granted (0/1), countAfter, ttlSecRemaining}
    local setKey = KEYS[1]
    local limit = tonumber(ARGV[1])
    local ttlSec = tonumber(ARGV[2])
    local jobId = ARGV[3]

    local count = redis.call('SCARD', setKey)
    if count >= limit then
      local ttl = redis.call('TTL', setKey)
      return {0, count, ttl}
    end

    local added = redis.call('SADD', setKey, jobId)
    if added == 0 then
      -- Job already exists, consider it granted
      local ttl = redis.call('TTL', setKey)
      return {1, count, ttl}
    end

    count = count + 1
    if count == 1 then
      redis.call('EXPIRE', setKey, ttlSec)
    end

    if count > limit then
      redis.call('SREM', setKey, jobId)
      local ttl = redis.call('TTL', setKey)
      return {0, count - 1, ttl}
    end

    local ttl = redis.call('TTL', setKey)
    return {1, count, ttl}
  `;

  private readonly releaseScript = `
    -- KEYS[1] = setKey
    -- ARGV[1] = jobId
    -- Returns: {removed (0/1), countAfter, ttlSecRemaining}
    local setKey = KEYS[1]
    local jobId = ARGV[1]
    local removed = redis.call('SREM', setKey, jobId)
    local count = redis.call('SCARD', setKey)
    local ttl = redis.call('TTL', setKey)
    return {removed, count, ttl}
  `;

  constructor(private inMemoryProviderService: InMemoryProviderService) {
    this.ttlBufferMs = Number(process.env.THROTTLE_REDIS_TTL_BUFFER_MS) || 30000;
  }

  private get redisClient(): Redis | undefined {
    return this.inMemoryProviderService.inMemoryProviderClient as Redis;
  }

  private buildSetKey(params: {
    environmentId: string;
    subscriberId: string;
    workflowId: string;
    stepId: string;
    windowStartMs: number;
    throttleKey?: string;
    throttleValue?: string;
  }): string {
    const baseKey = `throttle:${params.environmentId}:${params.subscriberId}:${params.workflowId}:${params.stepId}`;
    const throttleKeyPart =
      params.throttleKey && params.throttleValue ? `:${params.throttleKey}:${params.throttleValue}` : '';
    return `${baseKey}${throttleKeyPart}:${params.windowStartMs}:set`;
  }

  private computeWindowStart(nowMs: number, windowMs: number): number {
    return Math.floor(nowMs / windowMs) * windowMs;
  }

  private hashToTimestamp(identifier: string): number {
    // Create a simple hash of the identifier to generate a consistent timestamp
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      const char = identifier.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Use the absolute hash value as a base timestamp (but keep it reasonable)
    return Math.abs(hash) % 1000000000000; // Keep it within a reasonable range
  }

  private computeTtlSeconds(windowStartMs: number, windowMs: number, nowMs: number): number {
    const expiryMs = windowStartMs + windowMs + this.ttlBufferMs;
    return Math.ceil((expiryMs - nowMs) / 1000);
  }

  private async ensureScriptsLoaded(): Promise<void> {
    const client = this.redisClient;
    if (!client) {
      throw new Error('Redis client not available');
    }

    try {
      if (!this.reserveScriptSha) {
        this.reserveScriptSha = (await client.script('LOAD', this.reserveScript)) as string;
      }
      if (!this.releaseScriptSha) {
        this.releaseScriptSha = (await client.script('LOAD', this.releaseScript)) as string;
      }
    } catch (error) {
      Logger.error('Failed to load Lua scripts', error, LOG_CONTEXT);
      throw error;
    }
  }

  private async executeReserveScript(
    setKey: string,
    limit: number,
    ttlSec: number,
    jobId: string
  ): Promise<[number, number, number]> {
    const client = this.redisClient;
    if (!client) {
      throw new Error('Redis client not available');
    }

    try {
      await this.ensureScriptsLoaded();
      const result = await client.evalsha(
        this.reserveScriptSha!,
        1,
        setKey,
        limit.toString(),
        ttlSec.toString(),
        jobId
      );
      return result as [number, number, number];
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage?.includes('NOSCRIPT')) {
        Logger.warn('Script not found, reloading and retrying', LOG_CONTEXT);
        this.reserveScriptSha = null;
        await this.ensureScriptsLoaded();
        const result = await client.evalsha(
          this.reserveScriptSha!,
          1,
          setKey,
          limit.toString(),
          ttlSec.toString(),
          jobId
        );
        return result as [number, number, number];
      }
      throw error;
    }
  }

  async reserveThrottleSlot(params: IThrottleReservationParams): Promise<IThrottleReservationResult> {
    // For dynamic throttles, we need a consistent window identifier that doesn't change between triggers
    // Use a combination of subscriber, step, and throttle value as the window identifier
    // For fixed throttles, align to regular intervals (e.g., every hour on the hour)
    let windowStartMs: number;

    if (params.throttleType === 'dynamic') {
      // For dynamic throttles, use the dynamic value itself as the window identifier
      // This ensures all triggers with the same dynamic value share the same throttle window
      const dynamicValue = params.throttleValue || 'default';
      // Use a simple hash of the dynamic value to create a consistent window start
      // This ensures the same dynamic value always maps to the same window
      let hash = 0;
      for (let i = 0; i < dynamicValue.length; i++) {
        hash = (hash << 5) - hash + dynamicValue.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      // Use hash as offset from a base time to ensure positive TTL
      const baseTime = Math.floor(params.nowMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000); // Start of today
      windowStartMs = baseTime + (Math.abs(hash) % (24 * 60 * 60 * 1000)); // Hash within today

      console.log('Dynamic throttle window calculation:', {
        dynamicValue,
        hash,
        baseTime,
        windowStartMs,
        nowMs: params.nowMs,
      });
    } else {
      windowStartMs = this.computeWindowStart(params.nowMs, params.windowMs);
    }

    console.log('Throttle type:', params.throttleType);
    console.log('Window start calculation:', {
      isDynamic: params.throttleType === 'dynamic',
      nowMs: params.nowMs,
      windowMs: params.windowMs,
      computedWindowStart: this.computeWindowStart(params.nowMs, params.windowMs),
      finalWindowStartMs: windowStartMs,
      windowIdentifier:
        params.throttleType === 'dynamic'
          ? `${params.subscriberId}:${params.stepId}:${params.throttleValue || 'default'}`
          : 'N/A (fixed)',
    });

    const setKey = this.buildSetKey({
      environmentId: params.environmentId,
      subscriberId: params.subscriberId,
      workflowId: params.workflowId,
      stepId: params.stepId,
      windowStartMs,
      throttleKey: params.throttleKey,
      throttleValue: params.throttleValue,
    });

    console.log('Redis key:', setKey);

    const ttlSec = this.computeTtlSeconds(windowStartMs, params.windowMs, params.nowMs);

    try {
      console.log('Executing Redis script with:', {
        setKey,
        limit: params.limit,
        ttlSec,
        jobId: params.jobId,
      });

      const [granted, count, ttlSecRemaining] = await this.executeReserveScript(
        setKey,
        params.limit,
        ttlSec,
        params.jobId
      );

      console.log('Redis script result:', { granted, count, ttlSecRemaining });

      const result: IThrottleReservationResult = {
        granted: granted === 1,
        count,
        ttlMs: ttlSecRemaining > 0 ? ttlSecRemaining * 1000 : 0,
        windowStartMs,
      };

      console.log('Final throttle result:', result);

      Logger.debug(
        {
          ...params,
          windowStartMs,
          setKey,
          result,
        },
        'Throttle slot reservation result',
        LOG_CONTEXT
      );

      return result;
    } catch (error) {
      Logger.error(
        {
          error,
          params,
          windowStartMs,
          setKey,
        },
        'Failed to reserve throttle slot',
        LOG_CONTEXT
      );

      throw error;
    }
  }
}
