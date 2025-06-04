import { createClient } from 'redis';
import EventEmitter from 'events';
import zlib from 'zlib';

/**
 * Enhanced Redis Client with compression, performance monitoring, and subscriptions
 * Self-contained implementation without external dependencies
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
        
        // Performance thresholds
        this.performanceThresholds = {
            slowGet: 10,
            slowSet: 30
        };
        
        // Auto-initialize
        this._initializeRedisClient();
    }

    // UTILITY METHODS
    
    /**
     * Get current timestamp in milliseconds
     */
    _getTime() {
        return Date.now();
    }

    /**
     * Compress data using zlib
     */
    async _compress(data) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        return new Promise((resolve, reject) => {
            zlib.deflate(buffer, (err, compressed) => {
                if (err) reject(err);
                else resolve(compressed.toString('base64'));
            });
        });
    }

    /**
     * Decompress base64 data using zlib
     */
    async _decompress(base64Data) {
        const buffer = Buffer.from(base64Data, 'base64');
        return new Promise((resolve, reject) => {
            zlib.inflate(buffer, (err, decompressed) => {
                if (err) reject(err);
                else resolve(decompressed.toString('utf8'));
            });
        });
    }

    /**
     * Parse JSON safely
     */
    _parseJson(value) {
        try {
            return JSON.parse(value);
        } catch (e) {
            return false;
        }
    }

    /**
     * Serialize value to string
     */
    _serialize(value) {
        return typeof value === 'string' ? value : JSON.stringify(value);
    }

    /**
     * Format Redis key
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
        if (!this.client?.isOpen) {
            console.log(`[${this.alias}] Client not open, reconnecting...`);
            await this._initializeRedisClient();
        }
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
            this._initializeSubClient();
        }
        try {
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

    _initializeSubClient() {
        this.subClient = createClient(this.connectionConfig);
        this.subClient.on('error', (err) => console.error(`[${this.alias}] Subscription error:`, err));
        this.subClient.on('ready', async () => {
            console.log(`[${this.alias}] Subscription client reconnected.`);
            // Re-subscribe to previously subscribed namespaces
            for (const namespace of this.subscribedNamespaces) {
                await this.subscribeToKeyspaceEvents(namespace);
            }
        });
        this.subClient.connect().catch((err) =>
            console.error(`[${this.alias}] Subscription connect error:`, err)
        );
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

    // CLEANUP METHODS
    
    destroy() {
        this.subClient?.quit();
        this.client?.quit();
        console.log(`[${this.alias}] Client destroyed.`);
    }

    close() {
        this.client?.quit();
        console.log(`[${this.alias}] Connection closed.`);
    }
}

export default RedisClient;
