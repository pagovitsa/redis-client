# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2025-06-04

### Fixed
- **Race Condition**: Fixed ClientClosedError in getNamespaceSize() and getKeys() methods
- **SCAN Operations**: Replaced problematic SCAN loops with simple KEYS command
- **Connection Stability**: Eliminated race conditions where SCAN operations continued after client disconnection

### Changed
- **getNamespaceSize()**: Now uses `client.keys()` instead of SCAN for better reliability
- **getKeys()**: Now uses `client.keys()` instead of SCAN for better reliability
- **Performance**: Simplified operations reduce complexity and eliminate hanging issues

## [1.1.2] - 2025-06-04

### Removed
- **Example File**: Removed example.js file to streamline package distribution
- **Example Script**: Removed npm run example script from package.json
- **Example Documentation**: Cleaned up README.md references to example usage

### Changed
- Updated package files list to exclude example.js
- Cleaner project structure focused on core functionality
- Fixed test suite cleanup to prevent hanging tests

## [1.1.1] - 2025-06-04

### Fixed
- **Race Condition Fix**: Fixed critical race condition where commands could be sent before Redis connection was established
- **Connection Promise Management**: Added proper promise tracking for both main and subscription client connections
- **Subscription Client Initialization**: Made `_initializeSubClient()` async and ensured connection is awaited before sending commands
- **Connection State Verification**: Enhanced `_ensureClientConnected()` to properly wait for ongoing connections

### Technical Improvements
- Added `subClientConnectionPromise` tracking for subscription client connections
- Enhanced error handling for connection timing issues
- Improved connection reliability for keyspace event subscriptions

## [1.1.0] - 2025-06-04

### Added
- Enhanced constructor to accept flexible connection options (socket path or IP address)
- Support for custom username and password parameters in constructor
- Backward compatibility with legacy boolean connection options
- Improved connection configuration handling for various Redis setups

### Changed
- Constructor signature now supports: `new RedisClient(alias, connectionOptions, username, password)`
- Documentation updated with comprehensive connection examples

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