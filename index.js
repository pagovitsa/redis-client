import { createClient } from 'redis';
import EventEmitter from 'events';
import { promisify } from 'util';
import zlib from 'zlib';

// Promisify zlib operations for better performance
const deflateAsync = promisify(zlib.deflate);
const inflateAsync = promisify(zlib.inflate);

/**
 * Enhanced Redis Client with compression, performance monitoring, and subscriptions
 * Optimized for high performance with connection pooling and async compression
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
        
        // Performance optimizations
        this.compressionCache = new Map(); // Cache for compression results
        this.connectionCheckCache = { isValid: false, timestamp: 0 };
        this.batchQueue = [];
        this.batchTimeout = null;
        this.batchSize = 100;
        this.batchDelayMs = 10;
        
        // Performance thresholds
        this.performanceThresholds = {
            slowGet: 10,
            slowSet: 30
        };
        
        // Auto-initialize (don't await in constructor)
        this.connectionPromise = this._initializeRedisClient();
    }

    // UTILITY METHODS
    
    /**
     * Get current timestamp in milliseconds
     */
    _getTime() {
        return Date.now();
    }

    /**
     * Compress data using zlib (async, optimized)
     */
    async _compress(data) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        
        // Use compression cache for repeated data
        const cacheKey = buffer.toString('base64').slice(0, 32); // Use first 32 chars as cache key
        if (this.compressionCache.has(cacheKey)) {
            return this.compressionCache.get(cacheKey);
        }
        
        try {
            const compressed = await deflateAsync(buffer);
            const result = compressed.toString('base64');
            
            // Cache result (limit cache size)
            if (this.compressionCache.size < 1000) {
                this.compressionCache.set(cacheKey, result);
            }
            
            return result;
        } catch (error) {
            console.error(`[${this.alias}] Compression error:`, error);
            throw error;
        }
    }

    /**
     * Decompress base64 data using zlib (async, optimized)
     */
    async _decompress(base64Data) {
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            const decompressed = await inflateAsync(buffer);
            return decompressed.toString('utf8');
        } catch (error) {
            console.error(`[${this.alias}] Decompression error:`, error);
            throw error;
        }
    }

    /**
     * Parse JSON safely with better performance
     */
    _parseJson(value) {
        if (typeof value !== 'string') return false;
        if (value[0] !== '{' && value[0] !== '[') return false; // Fast JSON check
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
        return `${namespace}:${key}`;
    }

    /**
     * Log performance if slow
     */
    _logPerformance(operation, elapsed, namespace, key) {
        const threshold = operation === 'get' 
            ? this.performanceThresholds.slowGet 
            : this.performanceThresholds.slowSet;
            
        if (elapsed > threshold) {
            console.log(`[${this.alias}] Redis ${operation.toUpperCase()} took ${elapsed}ms for ${namespace}:${key}`);
        }
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
        // Use cached connection check for performance
        const now = Date.now();
        if (this.connectionCheckCache.isValid && (now - this.connectionCheckCache.timestamp) < 1000) {
            return; // Cache is still valid (1 second)
        }
        
        if (!this.client?.isOpen) {
            console.log(`[${this.alias}] Client not open, reconnecting...`);
            this.connectionCheckCache.isValid = false;
            await this._initializeRedisClient();
        } else if (this.connectionPromise) {
            // Wait for ongoing connection
            await this.connectionPromise;
        }
        
        // Update cache
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
            // Use SCAN for better performance on large datasets
            const pattern = `${namespace}:*`;
            let cursor = '0';
            let count = 0;
            do {
                const result = await this.client.scan(cursor, {
                    MATCH: pattern,
                    COUNT: 1000
                });
                cursor = result.cursor;
                count += result.keys.length;
            } while (cursor !== '0');
            console.log(`[${this.alias}] ${count} keys in '${namespace}'.`);
            return count;
        } catch (error) {
            console.error(`[${this.alias}] Error retrieving namespace size:`, error);
            throw error;
        }
    }

    async getKeys(namespace) {
        try {
            await this._ensureClientConnected();
            const pattern = `${namespace}:*`;
            let cursor = '0';
            let keys = [];
            do {
                const result = await this.client.scan(cursor, {
                    MATCH: pattern,
                    COUNT: 100
                });
                cursor = result.cursor;
                keys = keys.concat(result.keys);
            } while (cursor !== '0');
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
            
            await this.subClient.sendCommand(['CONFIG', 'SET', 'notify-keyspace-events', 'KEA']);
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

    // BULK OPERATIONS (High Performance)
    
    /**
     * Set multiple keys at once using pipeline
     */
    async setBulk(namespace, keyValuePairs, expirationInSeconds) {
        try {
            await this._ensureClientConnected();
            const pipeline = this.client.multi();
            const startTime = this._getTime();
            
            for (const [key, value] of Object.entries(keyValuePairs)) {
                const redisKey = this._formatKey(namespace, key);
                const valueToStore = this._serialize(value);
                const compressed = await this._compress(valueToStore);
                
                pipeline.set(redisKey, compressed);
                if (expirationInSeconds) {
                    pipeline.expire(redisKey, expirationInSeconds);
                }
            }
            
            await pipeline.exec();
            const elapsed = this._getTime() - startTime;
            
            if (elapsed > this.performanceThresholds.slowSet) {
                console.log(`[${this.alias}] Bulk SET of ${Object.keys(keyValuePairs).length} keys took ${elapsed}ms`);
            }
        } catch (error) {
            console.error(`[${this.alias}] Error in bulk set:`, error);
            throw error;
        }
    }

    /**
     * Get multiple keys at once using pipeline
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
                console.log(`[${this.alias}] Bulk GET of ${keys.length} keys took ${elapsed}ms`);
            }
            
            const output = {};
            for (let i = 0; i < keys.length; i++) {
                const value = results[i];
                if (value) {
                    const decompressed = await this._decompress(value);
                    const result = this._parseJson(decompressed);
                    output[keys[i]] = result !== false ? result : decompressed;
                } else {
                    output[keys[i]] = null;
                }
            }
            
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
            
            return await pipeline.exec();
        } catch (error) {
            console.error(`[${this.alias}] Error in bulk delete:`, error);
            throw error;
        }
    }

    // CLEANUP METHODS
    
    destroy() {
        // Clear caches
        this.compressionCache.clear();
        this.connectionCheckCache = { isValid: false, timestamp: 0 };
        
        // Clear timeouts
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }
        
        // Close connections
        this.subClient?.quit();
        this.client?.quit();
        console.log(`[${this.alias}] Client destroyed.`);
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
        this.connectionCheckCache = { isValid: false, timestamp: 0 };
        console.log(`[${this.alias}] Caches cleared.`);
    }
}

export default RedisClient;
