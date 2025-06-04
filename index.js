import { createClient } from 'redis';
import EventEmitter from 'events';
import { promisify } from 'util';
import zlib from 'zlib';

// Promisify zlib operations for better performance
const deflateAsync = promisify(zlib.deflate);
const inflateAsync = promisify(zlib.inflate);

// Performance optimizations: Pre-compiled patterns and constants
const REDIS_KEY_SEPARATOR = ':';
const JSON_START_CHARS = new Set(['{', '[']);
const COMPRESSION_CACHE_MAX_SIZE = 2000;
const CONNECTION_CACHE_TTL = 5000; // 5 seconds
const BATCH_FLUSH_INTERVAL = 5; // ms
const PIPELINE_BATCH_SIZE = 50;

/**
 * Enhanced Redis Client with compression, performance monitoring, and subscriptions
 * Optimized for high performance with connection pooling, caching, and async compression
 * Performance features:
 * - Connection pooling and reuse
 * - Compression result caching
 * - Batch operation support
 * - Optimized serialization/deserialization
 * - Fast path for common operations
 * - Memory-efficient key formatting
 * - Async compression with caching
 */
class RedisClient extends EventEmitter {
    constructor(alias = 'default', connectionOptions = {}, username = 'root', password = 'root') {
        super();
        this.alias = alias;
        
        // Handle different connection options
        if (typeof connectionOptions === 'boolean') {
            // Legacy support: remote = true/false
            this.socketPath = connectionOptions
                ? '/media/redis/remote.sock'
                : '/media/redis/local.sock';
            this.connectionConfig = {
                socket: { path: this.socketPath },
                username: username,
                password: password
            };
        } else if (typeof connectionOptions === 'string') {
            // String can be either socket path or IP:port
            if (connectionOptions.includes('/') || connectionOptions.includes('.sock')) {
                // Socket path
                this.socketPath = connectionOptions;
                this.connectionConfig = {
                    socket: { path: this.socketPath },
                    username: username,
                    password: password
                };
            } else {
                // IP address or hostname (with optional port)
                const [host, port = 6379] = connectionOptions.split(':');
                this.connectionConfig = {
                    socket: { 
                        host: host,
                        port: parseInt(port)
                    },
                    username: username,
                    password: password
                };
            }
        } else if (typeof connectionOptions === 'object' && connectionOptions !== null) {
            // Full configuration object
            this.connectionConfig = {
                socket: connectionOptions.socket || { 
                    host: connectionOptions.host || 'localhost',
                    port: connectionOptions.port || 6379,
                    path: connectionOptions.path
                },
                username: connectionOptions.username || username,
                password: connectionOptions.password || password,
                ...connectionOptions
            };
            if (connectionOptions.path) {
                this.socketPath = connectionOptions.path;
            }
        } else {
            // Default local socket
            this.socketPath = '/media/redis/local.sock';
            this.connectionConfig = {
                socket: { path: this.socketPath },
                username: username,
                password: password
            };
        }
        
        this.client = null;
        this.subClient = null;
        this.subscribedNamespaces = new Set();
        this.isConnecting = false;
        this.connectionPromise = null;
        this.subClientConnectionPromise = null;
        this.keyspaceEventsConfigured = false; // Track if keyspace events are configured
        
        // Performance optimizations
        this.compressionCache = new Map(); // Cache for compression results
        this.decompressionCache = new Map(); // Cache for decompression results
        this.keyFormatCache = new Map(); // Cache for formatted keys
        this.connectionCheckCache = { isValid: false, timestamp: 0 };
        this.performanceStats = {
            cacheHits: 0,
            cacheMisses: 0,
            compressionTime: 0,
            decompressionTime: 0,
            operationCount: 0
        };
        
        // Batch operation support
        this.batchQueue = [];
        this.batchTimeout = null;
        this.batchSize = PIPELINE_BATCH_SIZE;
        this.batchDelayMs = BATCH_FLUSH_INTERVAL;
        
        // Performance thresholds
        this.performanceThresholds = {
            slowGet: 10,
            slowSet: 30,
            cacheSize: COMPRESSION_CACHE_MAX_SIZE
        };
        
        // Auto-initialize (don't await in constructor)
        this.connectionPromise = this._initializeRedisClient();
    }

    // UTILITY METHODS
    
    /**
     * Get current timestamp in milliseconds (optimized)
     */
    _getTime() {
        return performance.now();
    }

    /**
     * Generate cache key for compression (optimized hash)
     */
    _getCacheKey(data) {
        // Simple hash for cache keys to avoid expensive operations
        let hash = 0;
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        for (let i = 0; i < Math.min(str.length, 100); i++) { // Limit to first 100 chars
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Compress data using zlib (async, optimized with caching)
     */
    async _compress(data) {
        const startTime = this._getTime();
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        
        // Use optimized cache key
        const cacheKey = this._getCacheKey(data);
        if (this.compressionCache.has(cacheKey)) {
            this.performanceStats.cacheHits++;
            return this.compressionCache.get(cacheKey);
        }
        
        this.performanceStats.cacheMisses++;
        
        try {
            const compressed = await deflateAsync(buffer);
            const result = compressed.toString('base64');
            
            // Manage cache size efficiently
            if (this.compressionCache.size >= this.performanceThresholds.cacheSize) {
                // Remove oldest entries (LRU-like behavior)
                const keysToDelete = Array.from(this.compressionCache.keys()).slice(0, Math.floor(this.performanceThresholds.cacheSize * 0.2));
                keysToDelete.forEach(key => this.compressionCache.delete(key));
            }
            
            this.compressionCache.set(cacheKey, result);
            this.performanceStats.compressionTime += this._getTime() - startTime;
            
            return result;
        } catch (error) {
            console.error(`[${this.alias}] Compression error:`, error);
            throw error;
        }
    }

    /**
     * Decompress base64 data using zlib (async, optimized with caching)
     */
    async _decompress(base64Data) {
        const startTime = this._getTime();
        const cacheKey = this._getCacheKey(base64Data);
        
        if (this.decompressionCache.has(cacheKey)) {
            this.performanceStats.cacheHits++;
            return this.decompressionCache.get(cacheKey);
        }
        
        this.performanceStats.cacheMisses++;
        
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            const decompressed = await inflateAsync(buffer);
            const result = decompressed.toString('utf8');
            
            // Cache management for decompression
            if (this.decompressionCache.size >= this.performanceThresholds.cacheSize) {
                const keysToDelete = Array.from(this.decompressionCache.keys()).slice(0, Math.floor(this.performanceThresholds.cacheSize * 0.2));
                keysToDelete.forEach(key => this.decompressionCache.delete(key));
            }
            
            this.decompressionCache.set(cacheKey, result);
            this.performanceStats.decompressionTime += this._getTime() - startTime;
            
            return result;
        } catch (error) {
            console.error(`[${this.alias}] Decompression error:`, error);
            throw error;
        }
    }

    /**
     * Parse JSON safely with better performance and caching
     */
    _parseJson(value) {
        if (typeof value !== 'string') return false;
        if (!JSON_START_CHARS.has(value[0])) return false; // Fast JSON check using Set
        
        try {
            return JSON.parse(value);
        } catch (e) {
            return false;
        }
    }

    /**
     * Serialize value to string (optimized)
     */
    _serialize(value) {
        return typeof value === 'string' ? value : JSON.stringify(value);
    }

    /**
     * Format Redis key (cached for performance)
     */
    _formatKey(namespace, key) {
        const cacheKey = `${namespace}${REDIS_KEY_SEPARATOR}${key}`;
        
        if (this.keyFormatCache.has(cacheKey)) {
            return this.keyFormatCache.get(cacheKey);
        }
        
        const formatted = `${namespace}${REDIS_KEY_SEPARATOR}${key}`;
        
        // Limit cache size for key formatting
        if (this.keyFormatCache.size >= 1000) {
            this.keyFormatCache.clear(); // Simple cache clearing
        }
        
        this.keyFormatCache.set(cacheKey, formatted);
        return formatted;
    }

    /**
     * Log performance if slow (enhanced with statistics)
     */
    _logPerformance(operation, elapsed, namespace, key) {
        this.performanceStats.operationCount++;
        
        const threshold = operation === 'get' 
            ? this.performanceThresholds.slowGet 
            : this.performanceThresholds.slowSet;
            
        if (elapsed > threshold) {
            console.log(`[${this.alias}] Redis ${operation.toUpperCase()} took ${elapsed.toFixed(2)}ms for ${namespace}:${key}`);
        }
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        const hitRate = this.performanceStats.cacheHits / (this.performanceStats.cacheHits + this.performanceStats.cacheMisses) * 100 || 0;
        return {
            ...this.performanceStats,
            cacheHitRate: hitRate.toFixed(2) + '%',
            avgCompressionTime: (this.performanceStats.compressionTime / this.performanceStats.operationCount || 0).toFixed(2) + 'ms',
            avgDecompressionTime: (this.performanceStats.decompressionTime / this.performanceStats.operationCount || 0).toFixed(2) + 'ms'
        };
    }

    // CONNECTION METHODS
    
    async _initializeRedisClient() {
        console.log(`[${this.alias}] Initializing Redis client...`);
        this.client = createClient(this.connectionConfig);
        this.client.on('error', (err) => console.error(`[${this.alias}] Redis error:`, err));
        this.client.on('ready', () => console.log(`[${this.alias}] Redis connected.`));

        try {
            await this.client.connect();
        } catch (err) {
            console.error(`[${this.alias}] Connection error:`, err);
        }
    }

    async _ensureClientConnected() {
        // Use cached connection check for performance (extended TTL)
        const now = Date.now();
        if (this.connectionCheckCache.isValid && (now - this.connectionCheckCache.timestamp) < CONNECTION_CACHE_TTL) {
            return; // Cache is still valid (5 seconds)
        }
        
        if (!this.client?.isOpen) {
            console.log(`[${this.alias}] Client not open, reconnecting...`);
            this.connectionCheckCache.isValid = false;
            await this._initializeRedisClient();
        } else if (this.connectionPromise) {
            // Wait for ongoing connection
            await this.connectionPromise;
        }
        
        // Update cache with extended TTL
        this.connectionCheckCache = { isValid: true, timestamp: now };
    }

    async reconnectClient() {
        if (this.client && this.client.isOpen) {
            console.log(`[${this.alias}] Already connected.`);
            return;
        }
        console.log(`[${this.alias}] Reinitializing connection...`);
        await this._initializeRedisClient();
    }

    // NAMESPACE OPERATIONS
    
    async getNamespaceSize(namespace) {
        try {
            await this._ensureClientConnected();
            // Use KEYS command for simplicity and reliability
            const keys = await this.client.keys(`${namespace}:*`);
            console.log(`[${this.alias}] ${keys.length} keys in '${namespace}'.`);
            return keys.length;
        } catch (error) {
            console.error(`[${this.alias}] Error retrieving namespace size:`, error);
            throw error;
        }
    }

    async getKeys(namespace) {
        try {
            await this._ensureClientConnected();
            // Use KEYS command for simplicity and reliability
            const keys = await this.client.keys(`${namespace}:*`);
            return keys;
        } catch (error) {
            console.error(`[${this.alias}] Error getting namespace keys:`, error);
            throw error;
        }
    }

    async getNamespace(namespace) {
        try {
            await this._ensureClientConnected();
            const pattern = `${namespace}:*`;
            return await this.client.keys(pattern);
        } catch (error) {
            console.error(`[${this.alias}] Error getting namespace:`, error);
            throw error;
        }
    }

    /**
     * Get a complete snapshot of all keys and values from a Redis namespace
     * @param {string} namespace - The namespace to retrieve (e.g., 'pair', 'block')
     * @param {number} batchSize - Batch size for bulk operations (default: 100)
     * @returns {Promise<Object>} - Object containing all key-value pairs from the namespace
     */
    async getNamespaceSnapshot(namespace, batchSize = 100) {
        try {
            // Get all keys in the namespace
            const keys = await this.getNamespace(namespace);
            
            // Extract clean keys (remove namespace prefix)
            const cleanKeys = keys.map(key => key.replace(`${namespace}:`, ''));
            
            // Use the Redis client's optimized bulk batched operation
            const values = await this.getBulkBatched(namespace, cleanKeys, batchSize);
            
            return values;
        } catch (error) {
            console.error(`[${this.alias}] Error getting namespace snapshot:`, error);
            throw error;
        }
    }

    // KEY OPERATIONS
    
    async setKey(namespace, key, value, expirationInSeconds) {
        try {
            await this._ensureClientConnected();
            const redisKey = this._formatKey(namespace, key);
            const valueToStore = this._serialize(value);
            const compressed = await this._compress(valueToStore);
            
            const startTime = this._getTime();
            await this.client.set(redisKey, compressed);
            
            if (expirationInSeconds) {
                await this.client.expire(redisKey, expirationInSeconds);
            }
            
            const elapsed = this._getTime() - startTime;
            this._logPerformance('set', elapsed, namespace, key);
        } catch (error) {
            console.error(`[${this.alias}] Error saving key:`, error);
            throw error;
        }
    }

    async getKey(namespace, key) {
        try {
            await this._ensureClientConnected();
            const startTime = this._getTime();
            const redisKey = this._formatKey(namespace, key);
            const value = await this.client.get(redisKey);
            const elapsed = this._getTime() - startTime;
            
            this._logPerformance('get', elapsed, namespace, key);
            
            if (value) {
                const decompressed = await this._decompress(value);
                const result = this._parseJson(decompressed);
                return result !== false ? result : decompressed;
            }
            
            return null;
        } catch (error) {
            console.error(`[${this.alias}] Error retrieving key:`, error);
            return null;
        }
    }

    async checkKey(namespace, key) {
        try {
            await this._ensureClientConnected();
            const exists = await this.client.exists(this._formatKey(namespace, key));
            return exists === 1;
        } catch (error) {
            console.error(`[${this.alias}] Error checking key:`, error);
            return false;
        }
    }

    async deleteKey(namespace, key, pipeline = null) {
        try {
            const redisKey = this._formatKey(namespace, key);
            if (pipeline) {
                pipeline.del(redisKey);
            } else {
                await this._ensureClientConnected();
                await this.client.del(redisKey);
            }
        } catch (error) {
            console.error(`[${this.alias}] Error deleting key:`, error);
            throw error;
        }
    }

    async expireKey(namespace, key, expirationTimeInSeconds) {
        try {
            await this._ensureClientConnected();
            await this.client.expire(this._formatKey(namespace, key), expirationTimeInSeconds);
        } catch (error) {
            console.error(`[${this.alias}] Error setting expiration:`, error);
            throw error;
        }
    }

    // SUBSCRIPTION METHODS
    
    async subscribeToKeyspaceEvents(namespace) {
        // Configure keyspace events on main client if not already done
        if (!this.keyspaceEventsConfigured) {
            try {
                await this._ensureClientConnected();
                await this.client.sendCommand(['CONFIG', 'SET', 'notify-keyspace-events', 'KEA']);
                this.keyspaceEventsConfigured = true;
                console.log(`[${this.alias}] Configured keyspace events.`);
            } catch (configErr) {
                console.error(`[${this.alias}] Warning: Could not configure keyspace events:`, configErr.message);
                // Continue anyway - keyspace events might already be configured
            }
        }

        if (!this.subClient) {
            await this._initializeSubClient();
        } else if (this.subClientConnectionPromise) {
            // Wait for ongoing subscription client connection
            await this.subClientConnectionPromise;
        }
        try {
            // Ensure subscription client is connected before sending commands
            if (!this.subClient.isOpen) {
                await this.subClientConnectionPromise;
            }
            
            // Subscribe to keyspace events (removed CONFIG SET from here)
            const pattern = `__keyspace@0__:${namespace}:*`;
            await this.subClient.pSubscribe(pattern, (message, channel) => {
                const key = channel.replace(`__keyspace@0__:${namespace}:`, '');
                this.emit('keyspace', { namespace, key, event: message });
            });
            this.subscribedNamespaces.add(namespace);
            console.log(`[${this.alias}] Subscribed to keyspace events for '${namespace}'.`);
        } catch (err) {
            console.error(`[${this.alias}] Subscription error:`, err);
            throw err;
        }
    }

    async unsubscribeFromNamespace(namespace) {
        if (this.subscribedNamespaces.has(namespace)) {
            try {
                await this.subClient.pUnsubscribe(`__keyspace@0__:${namespace}:*`);
                this.subscribedNamespaces.delete(namespace);
                console.log(`[${this.alias}] Unsubscribed from '${namespace}'.`);
            } catch (err) {
                console.error(`[${this.alias}] Error unsubscribing from '${namespace}':`, err);
                throw err;
            }
        }
    }

    async _initializeSubClient() {
        this.subClient = createClient(this.connectionConfig);
        this.subClient.on('error', (err) => console.error(`[${this.alias}] Subscription error:`, err));
        this.subClient.on('ready', async () => {
            console.log(`[${this.alias}] Subscription client reconnected.`);
            // Re-subscribe to previously subscribed namespaces
            for (const namespace of this.subscribedNamespaces) {
                await this.subscribeToKeyspaceEvents(namespace);
            }
        });
        this.subClientConnectionPromise = this.subClient.connect().catch((err) =>
            console.error(`[${this.alias}] Subscription connect error:`, err)
        );
        await this.subClientConnectionPromise;
    }

    // PIPELINE OPERATIONS
    
    createPipeline() {
        if (!this.client?.isOpen) {
            console.error(`[${this.alias}] Client not connected.`);
            return null;
        }
        return this.client.multi();
    }

    async executePipeline(pipeline) {
        try {
            return await pipeline.exec();
        } catch (error) {
            console.error(`[${this.alias}] Pipeline error:`, error);
            throw error;
        }
    }

    // BULK OPERATIONS (High Performance with Advanced Optimization)
    
    /**
     * Set multiple keys at once using optimized pipeline with compression batching
     */
    async setBulk(namespace, keyValuePairs, expirationInSeconds) {
        try {
            await this._ensureClientConnected();
            const pipeline = this.client.multi();
            const startTime = this._getTime();
            
            // Pre-compress all values in parallel for better performance
            const entries = Object.entries(keyValuePairs);
            const compressionPromises = entries.map(async ([key, value]) => {
                const valueToStore = this._serialize(value);
                const compressed = await this._compress(valueToStore);
                return [key, compressed];
            });
            
            const compressedEntries = await Promise.all(compressionPromises);
            
            // Build pipeline with pre-compressed data
            for (const [key, compressed] of compressedEntries) {
                const redisKey = this._formatKey(namespace, key);
                pipeline.set(redisKey, compressed);
                if (expirationInSeconds) {
                    pipeline.expire(redisKey, expirationInSeconds);
                }
            }
            
            await pipeline.exec();
            const elapsed = this._getTime() - startTime;
            
            if (elapsed > this.performanceThresholds.slowSet) {
                console.log(`[${this.alias}] Bulk SET of ${entries.length} keys took ${elapsed.toFixed(2)}ms`);
            }
            
            this.performanceStats.operationCount += entries.length;
        } catch (error) {
            console.error(`[${this.alias}] Error in bulk set:`, error);
            throw error;
        }
    }

    /**
     * Get multiple keys at once using optimized pipeline with parallel decompression
     */
    async getBulk(namespace, keys) {
        try {
            await this._ensureClientConnected();
            const startTime = this._getTime();
            const pipeline = this.client.multi();
            
            const redisKeys = keys.map(key => this._formatKey(namespace, key));
            for (const redisKey of redisKeys) {
                pipeline.get(redisKey);
            }
            
            const results = await pipeline.exec();
            const elapsed = this._getTime() - startTime;
            
            if (elapsed > this.performanceThresholds.slowGet) {
                console.log(`[${this.alias}] Bulk GET of ${keys.length} keys took ${elapsed.toFixed(2)}ms`);
            }
            
            // Parallel decompression for better performance
            const decompressionPromises = results.map(async (value, index) => {
                if (value) {
                    const decompressed = await this._decompress(value);
                    const result = this._parseJson(decompressed);
                    return [keys[index], result !== false ? result : decompressed];
                } else {
                    return [keys[index], null];
                }
            });
            
            const decompressionResults = await Promise.all(decompressionPromises);
            const output = Object.fromEntries(decompressionResults);
            
            this.performanceStats.operationCount += keys.length;
            return output;
        } catch (error) {
            console.error(`[${this.alias}] Error in bulk get:`, error);
            throw error;
        }
    }

    /**
     * Delete multiple keys at once using pipeline
     */
    async deleteBulk(namespace, keys) {
        try {
            await this._ensureClientConnected();
            const pipeline = this.client.multi();
            
            for (const key of keys) {
                const redisKey = this._formatKey(namespace, key);
                pipeline.del(redisKey);
            }
            
            const result = await pipeline.exec();
            this.performanceStats.operationCount += keys.length;
            return result;
        } catch (error) {
            console.error(`[${this.alias}] Error in bulk delete:`, error);
            throw error;
        }
    }

    /**
     * Advanced: Set keys with batching to prevent memory overload
     */
    async setBulkBatched(namespace, keyValuePairs, batchSize = 100, expirationInSeconds) {
        const entries = Object.entries(keyValuePairs);
        const results = [];
        
        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            const batchObject = Object.fromEntries(batch);
            
            await this.setBulk(namespace, batchObject, expirationInSeconds);
            results.push(`Batch ${Math.floor(i / batchSize) + 1} completed`);
        }
        
        return results;
    }

    /**
     * Advanced: Get keys with batching for large operations
     */
    async getBulkBatched(namespace, keys, batchSize = 100) {
        const results = {};
        
        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const batchResults = await this.getBulk(namespace, batch);
            Object.assign(results, batchResults);
        }
        
        return results;
    }

    /**
     * Advanced: Atomic increment/decrement operations
     */
    async incrementCounter(namespace, key, increment = 1) {
        try {
            await this._ensureClientConnected();
            const redisKey = this._formatKey(namespace, key);
            return await this.client.incrBy(redisKey, increment);
        } catch (error) {
            console.error(`[${this.alias}] Error incrementing counter:`, error);
            throw error;
        }
    }

    async decrementCounter(namespace, key, decrement = 1) {
        try {
            await this._ensureClientConnected();
            const redisKey = this._formatKey(namespace, key);
            return await this.client.decrBy(redisKey, decrement);
        } catch (error) {
            console.error(`[${this.alias}] Error decrementing counter:`, error);
            throw error;
        }
    }

    /**
     * Advanced: Lua script execution for atomic operations
     */
    async executeScript(script, keys = [], args = []) {
        try {
            await this._ensureClientConnected();
            return await this.client.eval(script, { keys, arguments: args });
        } catch (error) {
            console.error(`[${this.alias}] Error executing script:`, error);
            throw error;
        }
    }

    // CLEANUP METHODS
    
    destroy() {
        // Clear all caches
        this.compressionCache.clear();
        this.decompressionCache.clear();
        this.keyFormatCache.clear();
        this.connectionCheckCache = { isValid: false, timestamp: 0 };
        
        // Clear timeouts
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }
        
        // Close connections
        this.subClient?.quit();
        this.client?.quit();
        console.log(`[${this.alias}] Client destroyed with performance stats:`, this.getPerformanceStats());
    }

    close() {
        this.client?.quit();
        console.log(`[${this.alias}] Connection closed.`);
    }

    /**
     * Clear internal caches manually for memory management
     */
    clearCaches() {
        this.compressionCache.clear();
        this.decompressionCache.clear();
        this.keyFormatCache.clear();
        this.connectionCheckCache = { isValid: false, timestamp: 0 };
        console.log(`[${this.alias}] All caches cleared.`);
    }

    /**
     * Reset performance statistics
     */
    resetPerformanceStats() {
        this.performanceStats = {
            cacheHits: 0,
            cacheMisses: 0,
            compressionTime: 0,
            decompressionTime: 0,
            operationCount: 0
        };
        console.log(`[${this.alias}] Performance statistics reset.`);
    }

    /**
     * Optimize caches by removing old entries
     */
    optimizeCaches() {
        const compressionSize = this.compressionCache.size;
        const decompressionSize = this.decompressionCache.size;
        const keyFormatSize = this.keyFormatCache.size;
        
        // Clear caches if they're getting too large
        if (compressionSize > this.performanceThresholds.cacheSize * 1.5) {
            this.compressionCache.clear();
        }
        if (decompressionSize > this.performanceThresholds.cacheSize * 1.5) {
            this.decompressionCache.clear();
        }
        if (keyFormatSize > 1500) {
            this.keyFormatCache.clear();
        }
        
        console.log(`[${this.alias}] Cache optimization completed. Sizes: compression=${compressionSize}, decompression=${decompressionSize}, keyFormat=${keyFormatSize}`);
    }
}

export default RedisClient;
