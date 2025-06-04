# Enhanced Redis Client

A self-contained, feature-rich Redis client with built-in compression, performance monitoring, and keyspace event subscriptions. This package provides all the functionality of the original RedisClient without external tool dependencies.

## Features

- **Built-in Compression**: Automatic zlib compression/decompression for all stored values
- **Performance Monitoring**: Automatic logging of slow operations with configurable thresholds
- **Keyspace Event Subscriptions**: Subscribe to Redis keyspace events for real-time notifications
- **Connection Management**: Robust connection handling with auto-reconnection
- **Pipeline Support**: Batch operations for improved performance
- **Namespace Operations**: Easy management of key namespaces
- **Self-contained**: No external utility dependencies - all logic built-in

## Installation

```bash
npm install @bcoders/redis-client
```

## Basic Usage

```javascript
import RedisClient from '@bcoders/redis-client';

// Create a client instance
const redis = new RedisClient('my-app', false); // false = local, true = remote

// Set a value (automatically compressed)
await redis.setKey('users', 'john', { 
    name: 'John Doe', 
    email: 'john@example.com' 
});

// Get a value (automatically decompressed)
const user = await redis.getKey('users', 'john');
console.log(user); // { name: 'John Doe', email: 'john@example.com' }

// Check if key exists
const exists = await redis.checkKey('users', 'john');

// Delete a key
await redis.deleteKey('users', 'john');

// Clean up
redis.destroy();
```

## Advanced Features

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

### Key Operations

- `setKey(namespace, key, value, expirationInSeconds?)` - Store a key-value pair
- `getKey(namespace, key)` - Retrieve a value by key
- `checkKey(namespace, key)` - Check if a key exists
- `deleteKey(namespace, key, pipeline?)` - Delete a key
- `expireKey(namespace, key, seconds)` - Set expiration on a key

### Namespace Operations

- `getNamespaceSize(namespace)` - Get number of keys in namespace
- `getKeys(namespace)` - Get all keys in namespace (using SCAN)
- `getNamespace(namespace)` - Get all keys matching namespace pattern

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

## Performance

- Uses efficient SCAN operations instead of KEYS for namespace operations
- Automatic compression reduces Redis memory usage
- Pipeline support for batch operations
- Performance monitoring helps identify bottlenecks

## Examples

Run the included example:

```bash
npm run example
```

This demonstrates all major features of the client.

## Requirements

- Node.js 16+
- Redis server with Unix socket support
- Redis server configured for keyspace events (for subscriptions)

## License

ISC

## Contributing

Issues and pull requests welcome!
