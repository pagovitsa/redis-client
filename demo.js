#!/usr/bin/env node

/**
 * Demonstration of the enhanced hget method
 * Shows how to use hget to get a single field or all fields from a hash
 */

import RedisClient from './index.js';

console.log('🚀 Redis Client Enhanced hget Method Demo\n');

// Create a demo client (will try to connect to Redis if available)
const client = new RedisClient('demo-client');

console.log('📋 Enhanced hget Method Usage Examples:\n');

console.log('1. Get a specific field from a hash:');
console.log('   await client.hget("user-profiles", "john", "email")');
console.log('   // Returns: "john@example.com"\n');

console.log('2. Get multiple specific fields from a hash (NEW FUNCTIONALITY):');
console.log('   await client.hget("user-profiles", "john", ["email", "name"])');
console.log('   // Returns: { email: "john@example.com", name: "John Doe" }\n');

console.log('3. Get ALL fields from a hash (NEW FUNCTIONALITY):');
console.log('   await client.hget("user-profiles", "john")');
console.log('   // Returns: { email: "john@example.com", name: "John Doe", age: 30 }\n');

console.log('4. Set multiple fields in a hash:');
console.log('   await client.hset("user-profiles", "john", "email", "john@example.com")');
console.log('   await client.hset("user-profiles", "john", "name", "John Doe")');
console.log('   await client.hset("user-profiles", "john", "age", 30)\n');

console.log('5. Subscribe to multiple namespaces (NEW FUNCTIONALITY):');
console.log('   await client.subscribeToKeyspaceEvents(["users", "sessions", "cache"])');
console.log('   // Subscribes to keyspace events for all three namespaces\n');

console.log('🔧 Enhanced Method Signatures:');
console.log('   hget(namespace, key, field = null)');
console.log('   - namespace: string - The namespace for the key');
console.log('   - key: string - The Redis key');
console.log('   - field: string|string[]|null - Field specification:');
console.log('     * string: returns the value of that specific field');
console.log('     * array: returns object with specified field-value pairs');
console.log('     * null/undefined: returns object with ALL field-value pairs\n');
console.log('   subscribeToKeyspaceEvents(namespaces)');
console.log('   - namespaces: string|string[] - Single namespace or array of namespaces\n');

console.log('✨ Features:');
console.log('   ✅ Backward compatible - existing code continues to work');
console.log('   ✅ Compression/decompression support for all values');
console.log('   ✅ Performance monitoring and caching');
console.log('   ✅ Automatic JSON parsing when applicable');
console.log('   ✅ Error handling and logging\n');

console.log('📝 Note: This demo shows usage examples. To test with actual Redis operations,');
console.log('ensure you have a Redis server running and properly configured.\n');

// Clean up
client.destroy();
console.log('✨ Demo completed!');
