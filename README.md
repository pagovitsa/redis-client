# @bcoders.gr/redis-client

## Overview

@bcoders.gr/redis-client is a high-performance, self-contained Redis client designed for production workloads. It features advanced compression, multi-level caching, bulk operations, and comprehensive performance monitoring. The client is optimized for speed, memory efficiency, and scalability, making it suitable for demanding applications requiring intelligent cache management and optimized data handling.

## Key Features

- **Advanced Compression:** Optional zlib compression and decompression with caching to reduce memory usage and network bandwidth.
- **Multi-level Caching:** Caches compression, decompression, and key formatting results for optimal performance.
- **Hash Operations:** Full support for Redis hash operations with `hset` and `hget` methods, including compression support.
- **Bulk Operations:** Supports batch processing and pipelining for efficient handling of large datasets.
- **Performance Monitoring:** Real-time statistics tracking including cache hit rates, operation counts, and timing metrics.
- **Connection Management:** Robust connection handling with auto-reconnection and connection pooling.
- **Namespace Support:** Easy management of Redis key namespaces with optimized bulk operations.
- **Subscription Support:** Subscribe to Redis keyspace events for real-time notifications.
- **Memory Optimization:** Intelligent cache management with automatic cleanup and size limits.
- **High-Resolution Timing:** Uses `performance.now()` for precise performance measurements.
- **Self-contained:** No external utility dependencies; all logic is built-in and optimized.

## Installation

```bash
npm install @bcoders.gr/redis-client
```

## Usage

```javascript
import RedisClient from '@bcoders.gr/redis-client';

// Create a client instance with compression enabled
const redis = new RedisClient('my-app', {
    host: 'localhost',
    port: 6379
}, 'username', 'password', true); // Enable compression

// Set a key with automatic compression
await redis.setKey('users', 'john', { name: 'John Doe', email: 'john@example.com' });

// Get a key with automatic decompression
const user = await redis.getKey('users', 'john');
console.log(user);

// Hash operations with compression
await redis.hset('user-profiles', 'john', 'settings', { theme: 'dark', notifications: true });
const settings = await redis.hget('user-profiles', 'john', 'settings');

// Bulk set keys
const bulkData = {
    'user1': { name: 'Alice', age: 30 },
    'user2': { name: 'Bob', age: 25 }
};
await redis.setBulk('users', bulkData, 3600);

// Subscribe to keyspace events
redis.on('keyspace', (event) => {
    console.log('Key event:', event);
});
await redis.subscribeToKeyspaceEvents('users');
```

## API Reference

### Constructor

```javascript
new RedisClient(alias, connectionOptions, username, password, enableCompression)
```

- `alias` (string): Unique identifier for the client instance (default: 'default')
- `connectionOptions` (object): Redis connection configuration
- `username` (string): Redis username (default: 'root')
- `password` (string): Redis password (default: 'root')
- `enableCompression` (boolean): Enable zlib compression (default: false)

### Core Methods

- `setKey(namespace, key, value, expirationInSeconds?)` - Store a key-value pair with optional TTL.
- `getKey(namespace, key)` - Retrieve a value by key.
- `checkKey(namespace, key)` - Check if a key exists.
- `deleteKey(namespace, key, pipeline?)` - Delete a key.
- `expireKey(namespace, key, seconds)` - Set expiration on a key.

### Hash Operations

- `hset(namespace, key, field, value)` - Set a field in a hash with compression support.
- `hget(namespace, key, field)` - Get a field from a hash with decompression support.

### Bulk Operations

- `setBulk(namespace, keyValuePairs, expirationInSeconds?)` - Set multiple keys with parallel compression.
- `getBulk(namespace, keys)` - Get multiple keys with parallel decompression.
- `deleteBulk(namespace, keys)` - Delete multiple keys in a single pipeline.
- `setBulkBatched(namespace, keyValuePairs, batchSize?, expirationInSeconds?)` - Process large datasets in batches.
- `getBulkBatched(namespace, keys, batchSize?)` - Retrieve large datasets in batches.

### Advanced Features

- `incrementCounter(namespace, key, increment?)` - Atomic counter increment.
- `decrementCounter(namespace, key, decrement?)` - Atomic counter decrement.
- `executeScript(script, keys?, args?)` - Execute Lua scripts for complex atomic operations.
- `subscribeToKeyspaceEvents(namespace)` - Subscribe to Redis keyspace events.
- `unsubscribeFromNamespace(namespace)` - Unsubscribe from namespace.
- `createPipeline()` - Create a new pipeline.
- `executePipeline(pipeline)` - Execute a pipeline.
- `getNamespaceSize(namespace)` - Get number of keys in a namespace.
- `getKeys(namespace)` - Get all keys in a namespace.
- `getNamespaceSnapshot(namespace, batchSize?)` - Get a snapshot of all keys and values in a namespace.

### Performance and Monitoring

- `getPerformanceStats()` - Get performance statistics and cache metrics.
- `resetPerformanceStats()` - Reset performance counters.
- `clearCaches()` - Clear internal caches.
- `optimizeCaches()` - Optimize cache sizes and remove old entries.

## Configuration

The client supports environment-based configuration via the following environment variables:

- `REDIS_CLIENT_ALIAS` - Client instance alias.
- `REDIS_CLIENT_USERNAME` - Redis username.
- `REDIS_CLIENT_PASSWORD` - Redis password.
- `REDIS_CLIENT_CONNECTION` - JSON string or string for connection options.

## Requirements

- Node.js 16 or higher.
- Redis server with Unix socket support.
- Redis server configured for keyspace events (for subscriptions).

## Testing

Basic and performance tests are included in the package. To run tests:

```bash
npm test
npm run test:performance
```

## Publishing

To publish the package to npm:

```bash
npm run publish:package
```

Ensure you update the version in `package.json` before publishing.

## License

MIT License

## Contact

For issues or contributions, visit the [GitHub repository](https://github.com/pagovitsa/redis-client).
