# @bcoders.gr/redis-client

A **high-performance**, self-contained Redis client with advanced compression, multi-level caching, bulk operations, and comprehensive performance monitoring. Engineered for production workloads with intelligent cache management and optimized data handling.

## 🚀 Performance Features

- **Multi-level Caching**: Intelligent caching for compression, decompression, and key formatting
- **Parallel Processing**: Concurrent compression/decompression for bulk operations
- **Batch Operations**: Optimized pipeline processing with configurable batch sizes
- **Performance Analytics**: Real-time statistics tracking with cache hit rates and timing metrics
- **Memory Optimization**: Smart cache management with automatic cleanup and size limits
- **High-Resolution Timing**: Precise performance measurements using `performance.now()`

## 🛠️ Core Features

- **Built-in Compression**: Automatic zlib compression/decompression with caching for all stored values
- **Performance Monitoring**: Comprehensive logging of slow operations with configurable thresholds
- **Keyspace Event Subscriptions**: Subscribe to Redis keyspace events for real-time notifications
- **Connection Management**: Robust connection handling with auto-reconnection and connection pooling
- **Pipeline Support**: Advanced batch operations for improved performance
- **Namespace Operations**: Easy management of key namespaces with optimized bulk operations
- **Self-contained**: No external utility dependencies - all logic built-in with performance optimizations

## Installation

```bash
npm install @bcoders.gr/redis-client
```

## Basic Usage

```javascript
import RedisClient from '@bcoders.gr/redis-client';

// Create a client instance with different connection options:

// 1. Default local socket connection with default credentials
const redis = new RedisClient('my-app');

// 2. With custom username and password
const redis = new RedisClient('my-app', {}, 'admin', 'secret');

// 3. Legacy boolean option (backward compatibility)
const redis = new RedisClient('my-app', false, 'user', 'pass'); // local socket
const redis = new RedisClient('my-app', true, 'user', 'pass');  // remote socket

// 4. Custom socket path with credentials
const redis = new RedisClient('my-app', '/custom/path/redis.sock', 'admin', 'secret');

// 5. IP address connection with credentials
const redis = new RedisClient('my-app', '192.168.1.100', 'user', 'password');
const redis = new RedisClient('my-app', '192.168.1.100:6380', 'admin', 'secret');

// 6. Full configuration object (overrides individual username/password)
const redis = new RedisClient('my-app', {
    host: '192.168.1.100',
    port: 6379,
    username: 'admin',
    password: 'secret'
});

// 7. Socket path with configuration object
const redis = new RedisClient('my-app', {
    path: '/custom/redis.sock',
    username: 'admin',
    password: 'secret'
});

// Set a value (automatically compressed)
await redis.setKey('users', 'john', { 
    name: 'John Doe', 
    email: 'john@example.com' 
});

// Get a value (automatically decompressed)
const user = await redis.getKey('users', 'john');
console.log(user); // { name: 'John Doe', email: 'john@example.com' }

// Get an entire namespace (new in v1.2.2)
const allUsers = await redis.getNamespaceSnapshot('users');
console.log(`Retrieved ${Object.keys(allUsers).length} users`);

// Check if key exists
const exists = await redis.checkKey('users', 'john');

// Delete a key
await redis.deleteKey('users', 'john');

// Clean up
redis.destroy();
```

## Constructor API

```javascript
new RedisClient(alias, connectionOptions, username, password)
```

**Parameters:**
- `alias` (string, optional): A unique identifier for this client instance. Default: `'default'`
- `connectionOptions` (various types, optional): Connection configuration. Default: `{}`
  - **Boolean**: `true` for remote socket (`/media/redis/remote.sock`), `false` for local socket (`/media/redis/local.sock`)
  - **String**: Socket path (if contains `/` or `.sock`) or IP address with optional port (`192.168.1.100:6379`)
  - **Object**: Full configuration object with properties:
    - `host`: Redis server hostname (default: 'localhost')
    - `port`: Redis server port (default: 6379)
    - `path`: Unix socket path
    - `username`: Redis username
    - `password`: Redis password
    - `socket`: Socket configuration object
- `username` (string, optional): Redis username. Default: `'root'`
- `password` (string, optional): Redis password. Default: `'root'`

**Note:** If `connectionOptions` is an object with `username` and `password` properties, they will override the individual `username` and `password` parameters.

## Advanced Features

### High-Performance Bulk Operations

```javascript
// Optimized bulk operations with parallel compression
const bulkData = {
    'user1': { name: 'John', age: 30 },
    'user2': { name: 'Jane', age: 25 },
    'user3': { name: 'Bob', age: 35 }
};

// Set multiple keys at once (parallel compression)
await redis.setBulk('users', bulkData, 3600); // with TTL

// Get multiple keys at once (parallel decompression) 
const users = await redis.getBulk('users', ['user1', 'user2', 'user3']);

// Batched operations for large datasets
const largeDataset = {}; // ... 1000+ keys
await redis.setBulkBatched('dataset', largeDataset, 100); // Process in batches of 100
const results = await redis.getBulkBatched('dataset', Object.keys(largeDataset), 100);
```

### Performance Monitoring & Analytics

```javascript
// Get comprehensive performance statistics
const stats = redis.getPerformanceStats();
console.log('Cache Hit Rate:', stats.cacheHitRate); // e.g., "85.2%"
console.log('Total Operations:', stats.operationCount);
console.log('Average Compression Time:', stats.avgCompressionTime);

// Configure performance thresholds
redis.performanceThresholds = {
    slowGet: 5,      // Log GET operations slower than 5ms
    slowSet: 15,     // Log SET operations slower than 15ms
    cacheSize: 3000  // Maximum cache entries
};

// Reset statistics for new measurement period
redis.resetPerformanceStats();

// Optimize caches manually
redis.optimizeCaches();
```

### Advanced Operations

```javascript
// Atomic counter operations
await redis.incrementCounter('stats', 'page_views', 1);
await redis.decrementCounter('stats', 'inventory', 5);

// Execute Lua scripts for complex atomic operations
const script = `
    local key = KEYS[1]
    local increment = ARGV[1]
    local current = redis.call('GET', key) or 0
    local new_value = current + increment
    redis.call('SET', key, new_value)
    return new_value
`;
const result = await redis.executeScript(script, ['counter'], [10]);
```

### Namespace Operations

```javascript
// Get all keys in a namespace
const userKeys = await redis.getKeys('users');

// Get namespace size
const size = await redis.getNamespaceSize('users');

// Get all keys matching pattern
const allUserKeys = await redis.getNamespace('users');
```

### Pipeline Operations

```javascript
// Create a pipeline for batch operations
const pipeline = redis.createPipeline();
if (pipeline) {
    // Add operations to pipeline
    pipeline.set('key1', 'value1');
    pipeline.set('key2', 'value2');
    pipeline.del('oldkey');
    
    // Execute all operations at once
    const results = await redis.executePipeline(pipeline);
}
```

### Keyspace Event Subscriptions

```javascript
// Subscribe to keyspace events
redis.on('keyspace', (event) => {
    console.log('Key event:', event);
    // { namespace: 'users', key: 'john', event: 'set' }
});

await redis.subscribeToKeyspaceEvents('users');

// Now any changes to 'users:*' keys will trigger events
await redis.setKey('users', 'jane', { name: 'Jane' }); // Triggers event

// Unsubscribe when done
await redis.unsubscribeFromNamespace('users');
```

### Expiration

```javascript
// Set a key with TTL (time to live)
await redis.setKey('session', 'token123', { userId: 456 }, 3600); // 1 hour

// Set expiration on existing key
await redis.expireKey('session', 'token123', 1800); // 30 minutes
```

## Configuration

### Constructor Options

```javascript
const redis = new RedisClient(alias, remote);
```

- `alias` (string): Identifier for logging and debugging (default: 'default')
- `remote` (boolean): Whether to use remote socket path (default: false)

### Performance Thresholds

The client automatically logs slow operations. Default thresholds:
- GET operations: 10ms
- SET operations: 30ms

These are configurable via the `performanceThresholds` property:

```javascript
redis.performanceThresholds = {
    slowGet: 5,   // Log GET operations slower than 5ms
    slowSet: 20   // Log SET operations slower than 20ms
};
```

## Connection Paths

- **Local**: `/media/redis/local.sock`
- **Remote**: `/media/redis/remote.sock`

Both connections use:
- Username: `root`
- Password: `root`

## API Reference

### Performance Methods

- `getPerformanceStats()` - Get comprehensive performance statistics and cache metrics
- `resetPerformanceStats()` - Reset all performance counters
- `clearCaches()` - Clear all internal caches manually
- `optimizeCaches()` - Optimize cache sizes and remove old entries

### Key Operations

- `setKey(namespace, key, value, expirationInSeconds?)` - Store a key-value pair
- `getKey(namespace, key)` - Retrieve a value by key
- `checkKey(namespace, key)` - Check if a key exists
- `deleteKey(namespace, key, pipeline?)` - Delete a key
- `expireKey(namespace, key, seconds)` - Set expiration on a key

### High-Performance Bulk Operations

- `setBulk(namespace, keyValuePairs, expirationInSeconds?)` - Set multiple keys with parallel compression
- `getBulk(namespace, keys)` - Get multiple keys with parallel decompression
- `deleteBulk(namespace, keys)` - Delete multiple keys in a single pipeline
- `setBulkBatched(namespace, keyValuePairs, batchSize?, expirationInSeconds?)` - Process large datasets in batches
- `getBulkBatched(namespace, keys, batchSize?)` - Retrieve large datasets in batches

### Advanced Operations

- `incrementCounter(namespace, key, increment?)` - Atomic counter increment
- `decrementCounter(namespace, key, decrement?)` - Atomic counter decrement
- `executeScript(script, keys?, args?)` - Execute Lua scripts for complex atomic operations

### Namespace Operations

- `getNamespaceSize(namespace)` - Get number of keys in namespace
- `getKeys(namespace)` - Get all keys in namespace (using SCAN)
- `getNamespace(namespace)` - Get all keys matching namespace pattern
- `getNamespaceSnapshot(namespace, batchSize?)` - Get complete snapshot of all keys and values from a namespace

### Connection Management

- `reconnectClient()` - Manually reconnect the client
- `destroy()` - Close all connections and clean up
- `close()` - Close main connection only

### Pipeline Operations

- `createPipeline()` - Create a new pipeline
- `executePipeline(pipeline)` - Execute a pipeline

### Subscription Management

- `subscribeToKeyspaceEvents(namespace)` - Subscribe to keyspace events
- `unsubscribeFromNamespace(namespace)` - Unsubscribe from namespace

## Data Handling

### Compression

All values are automatically compressed using zlib before storage and decompressed when retrieved. This significantly reduces memory usage for large objects.

### Serialization

- Strings are stored as-is (after compression)
- Objects are JSON.stringify'd before compression
- Retrieved values are automatically parsed back to their original type

## Error Handling

The client includes comprehensive error handling:
- Connection errors are logged and trigger reconnection attempts
- Operation errors are logged with context
- Failed operations return `null` or `false` rather than throwing (configurable)

## Namespace Snapshot

The `getNamespaceSnapshot()` method provides a complete snapshot of all keys and values from a Redis namespace in a single operation.

```javascript
// Get all data from 'pair' namespace
const pairData = await client.getNamespaceSnapshot('pair');
console.log(`Retrieved ${Object.keys(pairData).length} pairs`);

// Sample of first few items
const sampleKeys = Object.keys(pairData).slice(0, 3);
sampleKeys.forEach(key => {
  console.log(`${key}: ${JSON.stringify(pairData[key])}`);
});

// For large datasets, use a custom batch size
const blockData = await client.getNamespaceSnapshot('block', 200);
```

### Benefits of getNamespaceSnapshot

- **Simplified Data Retrieval**: Get all namespace data in a single call
- **Clean Result Structure**: Keys have namespace prefix removed for easier processing
- **High Performance**: Uses optimized bulk batched operations under the hood
- **Memory Efficient**: Processes data in batches to manage memory usage
- **Automatic Type Handling**: Preserves original value types (objects, arrays, etc.)

## Performance

- **Multi-level Caching**: Compression, decompression, and key formatting results are cached for optimal performance
- **Parallel Processing**: Bulk operations use parallel compression/decompression for maximum throughput
- **Intelligent Cache Management**: Automatic cache size management with LRU-like cleanup strategies
- **High-Resolution Timing**: Precise performance measurements using `performance.now()` for accurate benchmarking
- **Optimized Data Structures**: Uses efficient Set-based JSON detection and optimized hash functions
- **Batch Processing**: Large datasets are processed in configurable batches to prevent memory overload
- **Connection Pooling**: Extended connection caching reduces connection overhead
- **Performance Analytics**: Real-time statistics tracking helps identify bottlenecks and optimization opportunities

## Testing

```bash
# Run basic functionality tests
npm test

# Run comprehensive performance benchmarks
npm run test:performance

# Run race condition fix verification
npm run test:fixes

# Run performance benchmarks (alias)
npm run benchmark
```

## Requirements

- Node.js 16+
- Redis server with Unix socket support
- Redis server configured for keyspace events (for subscriptions)

## License

MIT

## Contributing

Issues and pull requests welcome!
