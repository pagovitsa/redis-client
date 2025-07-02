# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.2] - 2025-07-02

### Added
- **NEW METHOD**: `getNamespaceStringValues()` - Get only string values from a namespace
- **ENHANCED**: `hget()` method now supports getting all fields when field parameter is omitted
- **ENHANCED**: `subscribeToKeyspaceEvents()` now accepts both single namespace string and array of namespaces

### Changed
- **MAJOR IMPROVEMENT**: `getNamespaceSnapshot()` now handles all Redis data types (strings, hashes, lists, sets, sorted sets)
- Enhanced error handling and data type detection in namespace operations
- Improved batch processing for mixed data types

### Fixed
- **CRITICAL FIX**: Resolved "WRONGTYPE Operation against a key holding the wrong kind of value" errors in `getNamespaceSnapshot()`
- Fixed issues when retrieving data from namespaces with mixed Redis data types
- Improved data type handling and conversion

## [1.4.1] - 2025-07-02

### Added
- Hash operations support with `hset` and `hget` methods
- Optional compression parameter in constructor (default: false)
- Compression can now be disabled for better performance when not needed

### Changed
- Updated Redis dependency to ^4.7.1
- Simplified README.md with focus on hash operations
- Constructor now accepts `enableCompression` parameter

### Fixed
- Hash operations now respect compression settings
- Better error handling in hash operations

## [1.2.5] - 2025-06-30

### Added
- Previous features and improvements up to v1.2.5

## [1.2.4] - Previous release

### Added
- Enhanced performance optimizations
- Removed deprecated files
- Updated documentation
