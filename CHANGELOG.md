# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-06-04

### Added
- Initial release of @bcoders/redis-client
- Built-in compression using zlib for all stored values
- Performance monitoring with configurable thresholds for slow operations
- Keyspace event subscriptions for real-time notifications
- Robust connection management with auto-reconnection
- Pipeline support for batch operations
- Namespace operations for easy key management
- Self-contained implementation without external utility dependencies
- Support for both local and remote Redis connections via Unix sockets
- Comprehensive error handling and logging
- EventEmitter integration for keyspace events
- Automatic JSON serialization/deserialization
- TTL support for key expiration

### Features
- **RedisClient Class**: Main client with alias support and connection management
- **Compression**: Automatic zlib compression/decompression for storage efficiency
- **Performance Monitoring**: Configurable thresholds for slow GET/SET operations
- **Subscriptions**: Keyspace event subscriptions with automatic re-subscription on reconnect
- **Pipeline Operations**: Batch operations using Redis MULTI/EXEC
- **Namespace Management**: Easy management of key namespaces with utility methods
- **Connection Handling**: Auto-reconnection and connection state management

### Technical Details
- Node.js >= 16.0.0 support
- ES Modules (type: "module")
- Redis client dependency (^4.6.0)
- Unix socket connections for optimal performance
- Built-in EventEmitter for real-time notifications