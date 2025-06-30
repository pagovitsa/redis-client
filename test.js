#!/usr/bin/env node

/**
 * Basic test suite for @bcoders/redis-client
 * This is a simple smoke test to verify the package loads correctly
 */

import RedisClient from './index.js';

console.log('🧪 Running basic tests for @bcoders/redis-client...\n');

// Keep track of all clients for cleanup
const testClients = [];

// Test 1: Module import
try {
    console.log('✅ Test 1: Module import successful');
} catch (error) {
    console.error('❌ Test 1: Module import failed:', error.message);
    process.exit(1);
}

// Test 2: Class instantiation
try {
    const client = new RedisClient('test-client-2');
    testClients.push(client);
    console.log('✅ Test 2: Class instantiation successful');
} catch (error) {
    console.error('❌ Test 2: Class instantiation failed:', error.message);
    process.exit(1);
}

// Test 3: Method availability
try {
    const client = new RedisClient('test-client-3');
    testClients.push(client);
    const methods = [
        'setKey',
        'getKey',
        'deleteKey',
        'checkKey',
        'getNamespaceSize',
        'subscribeToKeyspaceEvents',
        'createPipeline',
        'destroy',
        'hset',
        'hget'
    ];
    
    for (const method of methods) {
        if (typeof client[method] !== 'function') {
            throw new Error(`Method ${method} is not available`);
        }
    }
    console.log('✅ Test 3: All required methods are available');
} catch (error) {
    console.error('❌ Test 3: Method availability check failed:', error.message);
    process.exit(1);
}

// Test 4: Utility methods
try {
    const client = new RedisClient('test-client-4');
    testClients.push(client);
    
    // Test serialization
    const serialized = client._serialize({ test: 'data' });
    if (typeof serialized !== 'string') {
        throw new Error('Serialization failed');
    }
    
    // Test JSON parsing
    const parsed = client._parseJson('{"test": "data"}');
    if (typeof parsed !== 'object' || parsed.test !== 'data') {
        throw new Error('JSON parsing failed');
    }
    
    // Test key formatting
    const formattedKey = client._formatKey('namespace', 'key');
    if (formattedKey !== 'namespace:key') {
        throw new Error('Key formatting failed');
    }
    
    console.log('✅ Test 4: Utility methods working correctly');
} catch (error) {
    console.error('❌ Test 4: Utility method test failed:', error.message);
    process.exit(1);
}


console.log('\n🎉 All basic tests passed!');
console.log('📝 Note: These are smoke tests. Full functionality requires a Redis server connection.');

// Clean up all Redis connections
console.log('🧹 Cleaning up Redis connections...');
for (const client of testClients) {
    try {
        client.destroy();
    } catch (error) {
        // Ignore cleanup errors
    }
}

// Force exit after a short delay to ensure cleanup
setTimeout(() => {
    console.log('✨ Test cleanup completed');
    process.exit(0);
}, 100);
