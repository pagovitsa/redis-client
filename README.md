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
- `subscribeToKeyspaceEvents(namespace)` - Subscribe to Redis keyspace events. Now supports both single namespace string and array of namespaces.
- `unsubscribeFromNamespace(namespace)` - Unsubscribe from namespace.
- `createPipeline()` - Create a new pipeline.
- `executePipeline(pipeline)` - Execute a pipeline.
- `getNamespaceSize(namespace)` - Get number of keys in a namespace.
- `getKeys(namespace)` - Get all keys in a namespace.
- `getNamespaceSnapshot(namespace, batchSize?)` - **IMPROVED** Get a snapshot of all keys and values in a namespace. Now handles all Redis data types (strings, hashes, lists, sets, sorted sets).
- `getNamespaceSnapshotClean(namespace, batchSize?, pretty?)` - **NEW** Get a clean, JSON-serializable snapshot without prototype issues. Perfect for processing and logging.
- `getNamespaceStringValues(namespace, batchSize?)` - **NEW** Get only string values from a namespace (original behavior).
- `hget(namespace, key, field?)` - **ENHANCED** Get hash field value. When field parameter is omitted, returns all fields.

## Key Improvements in Latest Version

### Enhanced Data Type Support

The `getNamespaceSnapshot()` method has been significantly improved to handle all Redis data types:

- **Strings**: Compressed data stored via `setKey()` 
- **Hashes**: Key-value pairs stored with `hSet()`
- **Lists**: Ordered collections stored with Redis list commands
- **Sets**: Unique collections stored with Redis set commands  
- **Sorted Sets**: Scored collections stored with Redis sorted set commands

**Before (would fail with WRONGTYPE errors):**
```javascript
// Would fail if namespace contained mixed data types
const data = await client.getNamespaceSnapshot('mixed-data');
```

**Now (handles all data types gracefully):**
```javascript
// Works with any combination of Redis data types
const data = await client.getNamespaceSnapshot('mixed-data');
console.log(data);
// {
//   "user:1": { "name": "John", "age": 30 },           // String (compressed JSON)
//   "profile:1": { "name": "John", "city": "NYC" },    // Hash
//   "tags": ["redis", "database", "cache"],            // Set  
//   "scores": { "player1": 100, "player2": 85 },       // Sorted Set
//   "messages": ["Hello", "World", "Redis"]            // List
// }
```

### New String-Only Method

For cases where you only want string values (original behavior):
```javascript
const stringData = await client.getNamespaceStringValues('namespace');
```

### New Clean Data Methods

For better data processing and to avoid `[Object: null prototype]` display issues:

```javascript
// Get clean, normalized objects (recommended)
const cleanData = await client.getNamespaceSnapshotClean('namespace');
console.log(JSON.stringify(cleanData, null, 2)); // Perfect JSON output

// Get pretty-formatted string for logging
const prettyData = await client.getNamespaceSnapshotClean('namespace', 100, true);
console.log(prettyData); // Already formatted JSON string

// Process transaction data cleanly
const transactions = await client.getNamespaceSnapshotClean('tx');
Object.entries(transactions).forEach(([hash, tx]) => {
    console.log(`TX ${hash}: ${tx.value} wei from ${tx.from} to ${tx.to}`);
});
```

### Enhanced Hash Operations

The `hget()` method now supports getting all fields:
```javascript
// Get specific field
const fieldValue = await client.hget('namespace', 'key', 'field');

// Get all fields (NEW)
const allFields = await client.hget('namespace', 'key');
```

### Improved Keyspace Events

The `subscribeToKeyspaceEvents()` method now accepts multiple formats:
```javascript
// Single namespace
await client.subscribeToKeyspaceEvents('namespace');

// Multiple namespaces (NEW)
await client.subscribeToKeyspaceEvents(['namespace1', 'namespace2']);
```

## Performance and Monitoring

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
