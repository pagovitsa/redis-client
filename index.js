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
/**
 * RedisClient - High-performance Redis client with advanced features
 * 
 * @class
 */
class RedisClient extends EventEmitter {
    /**
     * Creates an instance of RedisClient.
     * @param {string} [alias='default'] - Unique identifier for the client instance.
     * @param {boolean|string|object} [connectionOptions={}] - Connection configuration.
     * @param {string} [username='root'] - Redis username.
     * @param {string} [password='root'] - Redis password.
     * @param {boolean} [enableCompression=false] - Whether to enable zlib compression (default false).
     */
    constructor(alias = process.env.REDIS_CLIENT_ALIAS || 'default', connectionOptions = {}, username = process.env.REDIS_CLIENT_USERNAME || 'root', password = process.env.REDIS_CLIENT_PASSWORD || 'root', enableCompression = false) {
        super();
        this.alias = alias;
        this.enableCompression = enableCompression;
        
        // Allow environment variable override for connection options
        if (process.env.REDIS_CLIENT_CONNECTION) {
            try {
                const envConfig = JSON.parse(process.env.REDIS_CLIENT_CONNECTION);
                connectionOptions = envConfig;
            } catch (e) {
                // If not JSON, treat as string
                connectionOptions = process.env.REDIS_CLIENT_CONNECTION;
            }
        }
        
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
        if (!this.enableCompression) {
            // Compression disabled, return original data as string
            return typeof data === 'string' ? data : JSON.stringify(data);
        }
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
        if (!this.enableCompression) {
            // Decompression disabled, return original data as string
            return base64Data;
        }
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
        this.client.on('error', (err) => {
            console.error(`[${this.alias}] Redis error:`, err);
            // Consider adding retry logic or alerting here for production
        });
        this.client.on('ready', () => console.log(`[${this.alias}] Redis connected.`));

        try {
            await this.client.connect();
        } catch (err) {
            console.error(`[${this.alias}] Connection error:`, err);
            // Retry connection with exponential backoff could be added here
        }
    }

    async _ensureClientConnected() {
        // Use cached connection check for performance (extended TTL)
        const now = Date.now();
        if (this.connectionCheckCache.isValid && (now - this.connectionCheckCache.timestamp) < CONNECTION_CACHE_TTL) {
            return; // Cache is still valid (5 seconds)
        }
        
        if (!this.client?.isOpen) {
            console.warn(`[${this.alias}] Client not open, reconnecting...`);
            this.connectionCheckCache.isValid = false;
            try {
                await this._initializeRedisClient();
            } catch (err) {
                console.error(`[${this.alias}] Reconnection failed:`, err);
                throw err;
            }
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
        try {
            await this._initializeRedisClient();
        } catch (err) {
            console.error(`[${this.alias}] Reconnection error:`, err);
            throw err;
        }
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
     * Handles different Redis data types (strings, hashes, lists, sets, sorted sets)
     * @param {string} namespace - The namespace to retrieve (e.g., 'pair', 'block')
     * @param {number} batchSize - Batch size for bulk operations (default: 100)
     * @returns {Promise<Object>} - Object containing all key-value pairs from the namespace
     */
    async getNamespaceSnapshot(namespace, batchSize = 100) {
        try {
            await this._ensureClientConnected();
            
            // Get all keys in the namespace
            const keys = await this.getNamespace(namespace);
            
            if (keys.length === 0) {
                return {};
            }
            
            const result = {};
            
            // Process keys in batches to avoid overwhelming Redis
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);
                const pipeline = this.client.multi();
                
                // First, get the type of each key
                for (const key of batch) {
                    pipeline.type(key);
                }
                
                const typeResults = await pipeline.exec();
                
                // Now get values based on type
                const valuePipeline = this.client.multi();
                
                for (let j = 0; j < batch.length; j++) {
                    const key = batch[j];
                    const keyType = typeResults[j];
                    
                    if (keyType === 'none') {
                        continue; // Key doesn't exist
                    }
                    
                    switch (keyType) {
                        case 'string':
                            valuePipeline.get(key);
                            break;
                        case 'hash':
                            valuePipeline.hGetAll(key);
                            break;
                        case 'list':
                            valuePipeline.lRange(key, 0, -1);
                            break;
                        case 'set':
                            valuePipeline.sMembers(key);
                            break;
                        case 'zset':
                            valuePipeline.zRangeWithScores(key, 0, -1);
                            break;
                        default:
                            // For unknown types, try to get as string
                            valuePipeline.get(key);
                            break;
                    }
                }
                
                const valueResults = await valuePipeline.exec();
                
                // Process results
                let resultIndex = 0;
                for (let j = 0; j < batch.length; j++) {
                    const key = batch[j];
                    const keyType = typeResults[j];
                    const cleanKey = key.replace(`${namespace}:`, '');
                    
                    if (keyType === 'none') {
                        continue;
                    }
                    
                    const value = valueResults[resultIndex++];
                    
                    try {
                        switch (keyType) {
                            case 'string':
                                // Try to decompress and parse if it's our compressed data
                                try {
                                    const decompressed = await this._decompress(value);
                                    const parsed = this._parseJson(decompressed);
                                    result[cleanKey] = this._normalizeObject(parsed !== false ? parsed : decompressed);
                                } catch (decompressError) {
                                    // If decompression fails, store as-is
                                    result[cleanKey] = this._normalizeObject(value);
                                }
                                break;
                            case 'hash':
                                result[cleanKey] = this._normalizeObject(value);
                                break;
                            case 'list':
                                result[cleanKey] = this._normalizeObject(value);
                                break;
                            case 'set':
                                result[cleanKey] = this._normalizeObject(value);
                                break;
                            case 'zset':
                                // Convert WITHSCORES result to object
                                const zsetObj = {};
                                if (Array.isArray(value)) {
                                    for (const item of value) {
                                        zsetObj[item.value] = item.score;
                                    }
                                }
                                result[cleanKey] = this._normalizeObject(zsetObj);
                                break;
                            default:
                                result[cleanKey] = this._normalizeObject(value);
                                break;
                        }
                    } catch (processError) {
                        console.warn(`[${this.alias}] Error processing key ${key}:`, processError);
                        result[cleanKey] = value; // Store raw value on error
                    }
                }
            }
            
            return result;
        } catch (error) {
            console.error(`[${this.alias}] Error getting namespace snapshot:`, error);
            throw error;
        }
    }

    /**
     * Get a clean, formatted snapshot of all keys and values from a Redis namespace
     * Returns JSON-serializable objects without prototype issues
     * @param {string} namespace - The namespace to retrieve
     * @param {number} batchSize - Batch size for bulk operations (default: 100)
     * @param {boolean} pretty - Whether to return pretty-formatted JSON string (default: false)
     * @returns {Promise<Object|string>} - Clean object or formatted JSON string
     */
    async getNamespaceSnapshotClean(namespace, batchSize = 100, pretty = false) {
        try {
            const snapshot = await this.getNamespaceSnapshot(namespace, batchSize);
            
            // Deep clean the object to ensure it's JSON serializable
            const cleanSnapshot = JSON.parse(JSON.stringify(snapshot));
            
            if (pretty) {
                return JSON.stringify(cleanSnapshot, null, 2);
            }
            
            return cleanSnapshot;
        } catch (error) {
            console.error(`[${this.alias}] Error getting clean namespace snapshot:`, error);
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

    /**
     * Set a field in a hash stored at key with compression
     * @param {string} namespace - Namespace for the key
     * @param {string} key - Redis key
     * @param {string} field - Field in the hash
     * @param {*} value - Value to set
     * @returns {Promise<void>}
     */
    async hset(namespace, key, field, value) {
        try {
            await this._ensureClientConnected();
            const redisKey = this._formatKey(namespace, key);
            const valueToStore = this._serialize(value);
            const compressed = await this._compress(valueToStore);

            const startTime = this._getTime();
            await this.client.hSet(redisKey, field, compressed);
            const elapsed = this._getTime() - startTime;
            this._logPerformance('hset', elapsed, namespace, key);
        } catch (error) {
            console.error(`[${this.alias}] Error in hset:`, error);
            throw error;
        }
    }

    /**
     * Get field(s) from a hash stored at key with decompression
     * @param {string} namespace - Namespace for the key
     * @param {string} key - Redis key
     * @param {string|string[]|null} [field=null] - Field specification:
     *   - string: gets single field value
     *   - array: gets multiple specific fields as object
     *   - null/undefined: gets all fields as object
     * @returns {Promise<*|Object>} - Single value, object with field-value pairs, or null if not found
     */
    async hget(namespace, key, field = null) {
        try {
            await this._ensureClientConnected();
            const redisKey = this._formatKey(namespace, key);
            const startTime = this._getTime();

            let value;
            // Handle different field parameter types
            if (field === null) {
                // Get all fields
                value = await this.client.hGetAll(redisKey);
            } else if (Array.isArray(field)) {
                // Get multiple specific fields
                value = await this.client.hmGet(redisKey, field);
                // Convert array result to object with field names as keys
                const objValue = {};
                field.forEach((f, index) => {
                    if (value[index] !== null) {
                        objValue[f] = value[index];
                    }
                });
                value = objValue;
            } else {
                // Get single field
                value = await this.client.hGet(redisKey, field);
                if (value !== null) {
                    // Convert single field result to object format for consistent handling
                    value = { [field]: value };
                }
            }
            
            const elapsed = this._getTime() - startTime;
            this._logPerformance('hget', elapsed, namespace, key);

            if (!value) return null;

            // Decompress all values
            const result = {};
            for (const [fieldName, fieldValue] of Object.entries(value)) {
                if (fieldValue !== null) {
                    const decompressed = await this._decompress(fieldValue);
                    const parsed = this._parseJson(decompressed);
                    result[fieldName] = parsed !== false ? parsed : decompressed;
                }
            }

            // Return single value if single field was requested
            return typeof field === 'string' ? result[field] : result;
        } catch (error) {
            console.error(`[${this.alias}] Error in hget:`, error);
            return null;
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
    
    async subscribeToKeyspaceEvents(namespaces) {
        // Convert single namespace to array for consistent handling
        const namespaceArray = Array.isArray(namespaces) ? namespaces : [namespaces];

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
            
            // Subscribe to keyspace events for each namespace
            for (const namespace of namespaceArray) {
                const pattern = `__keyspace@0__:${namespace}:*`;
                await this.subClient.pSubscribe(pattern, (message, channel) => {
                    const key = channel.replace(`__keyspace@0__:${namespace}:`, '');
                    this.emit('keyspace', { namespace, key, event: message });
                });
                this.subscribedNamespaces.add(namespace);
                console.log(`[${this.alias}] Subscribed to keyspace events for '${namespace}'.`);
            }
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

    /**
     * Get all string values from a namespace (original behavior)
     * This method only works with string keys and will skip other data types
     * @param {string} namespace - The namespace to retrieve
     * @param {number} batchSize - Batch size for bulk operations (default: 100)
     * @returns {Promise<Object>} - Object containing all string key-value pairs from the namespace
     */
    async getNamespaceStringValues(namespace, batchSize = 100) {
        try {
            // Get all keys in the namespace
            const keys = await this.getNamespace(namespace);
            
            // Extract clean keys (remove namespace prefix)
            const cleanKeys = keys.map(key => key.replace(`${namespace}:`, ''));
            
            // Use the Redis client's optimized bulk batched operation for strings only
            const values = await this.getBulkBatched(namespace, cleanKeys, batchSize);
            
            return values;
        } catch (error) {
            console.error(`[${this.alias}] Error getting namespace string values:`, error);
            throw error;
        }
    }

    /**
     * Normalize objects to have standard prototype and clean structure
     * Fixes [Object: null prototype] display issues
     * @param {*} obj - Object to normalize
     * @returns {*} - Normalized object
     */
    _normalizeObject(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this._normalizeObject(item));
        }
        
        if (typeof obj === 'object') {
            // Handle objects with null prototype or Redis hash objects
            const normalized = {};
            for (const [key, value] of Object.entries(obj)) {
                normalized[key] = this._normalizeObject(value);
            }
            return normalized;
        }
        
        return obj;
    }
}

export default RedisClient;
