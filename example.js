#!/usr/bin/env node

/**
 * Example usage of @bcoders/redis-client
 * 
 * This example demonstrates the main features of the enhanced Redis client.
 * Note: This requires a Redis server running with Unix socket at /media/redis/local.sock
 */

import RedisClient from './index.js';

async function runExample() {
    console.log('🚀 @bcoders/redis-client Example\n');
    
    // Create a Redis client instance
    const redis = new RedisClient('example-app', false); // false = local connection
    
    try {
        // Wait a moment for connection to establish
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('📝 Setting some example data...');
        
        // Set some data with automatic compression
        await redis.setKey('users', 'john', {
            name: 'John Doe',
            email: 'john@example.com',
            age: 30,
            preferences: {
                theme: 'dark',
                notifications: true
            }
        });
        
        await redis.setKey('users', 'jane', {
            name: 'Jane Smith',
            email: 'jane@example.com',
            age: 28,
            preferences: {
                theme: 'light',
                notifications: false
            }
        });
        
        // Set data with expiration (5 minutes)
        await redis.setKey('sessions', 'session123', {
            userId: 'john',
            loginTime: new Date().toISOString()
        }, 300);
        
        console.log('✅ Data stored successfully!\n');
        
        console.log('🔍 Retrieving data...');
        
        // Get individual keys
        const john = await redis.getKey('users', 'john');
        const jane = await redis.getKey('users', 'jane');
        const session = await redis.getKey('sessions', 'session123');
        
        console.log('👤 John:', john);
        console.log('👤 Jane:', jane);
        console.log('🔑 Session:', session);
        
        console.log('\n📊 Namespace operations...');
        
        // Get namespace size
        const userCount = await redis.getNamespaceSize('users');
        console.log(`👥 Users namespace contains ${userCount} keys`);
        
        // Get all keys in namespace
        const userKeys = await redis.getKeys('users');
        console.log('🔑 User keys:', userKeys);
        
        console.log('\n🔄 Pipeline operations...');
        
        // Create a pipeline for batch operations
        const pipeline = redis.createPipeline();
        if (pipeline) {
            // Add multiple operations to pipeline
            await redis.deleteKey('users', 'john', pipeline);
            await redis.deleteKey('users', 'jane', pipeline);
            
            // Execute all operations at once
            const results = await redis.executePipeline(pipeline);
            console.log('📦 Pipeline results:', results);
        }
        
        console.log('\n🔔 Keyspace event subscription example...');
        
        // Subscribe to keyspace events
        redis.on('keyspace', (event) => {
            console.log(`🔔 Keyspace event: ${event.event} on ${event.namespace}:${event.key}`);
        });
        
        await redis.subscribeToKeyspaceEvents('notifications');
        
        // Trigger some events
        await redis.setKey('notifications', 'alert1', { message: 'Test notification' });
        await redis.deleteKey('notifications', 'alert1');
        
        // Wait a moment to see events
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('\n✨ Example completed successfully!');
        
    } catch (error) {
        console.error('❌ Example failed:', error.message);
        
        if (error.message.includes('ENOENT') || error.message.includes('connect')) {
            console.log('\n💡 Tip: This example requires a Redis server running with Unix socket at /media/redis/local.sock');
            console.log('   You can modify the socket path in the RedisClient constructor if needed.');
        }
    } finally {
        // Clean up
        redis.destroy();
        console.log('\n🧹 Cleanup completed');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down example...');
    process.exit(0);
});

// Run the example
runExample().catch(console.error);
