#!/usr/bin/env node

/**
 * Test script for the improved getNamespaceSnapshot function
 * This demonstrates handling different Redis data types
 */

import RedisClient from './index.js';

async function testGetNamespaceSnapshot() {
    const client = new RedisClient('test-snapshot');
    
    try {
        console.log('🧪 Testing improved getNamespaceSnapshot with different data types...\n');
        
        // Clear any existing test data first
        console.log('🧹 Cleaning up any existing test data...');
        try {
            const existingKeys = await client.getNamespace('test');
            for (const key of existingKeys) {
                await client.client.del(key);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        
        // Add different types of data to Redis
        console.log('📝 Adding test data with different Redis data types...');
        
        // String values (compressed by our client)
        await client.setKey('test', 'user1', { name: 'John', age: 30 });
        await client.setKey('test', 'user2', { name: 'Jane', age: 25 });
        
        // Raw Redis operations for other data types
        await client._ensureClientConnected();
        
        // Hash
        await client.client.hSet('test:profile1', 'name', 'Alice');
        await client.client.hSet('test:profile1', 'age', '28');
        await client.client.hSet('test:profile1', 'city', 'New York');
        
        // List
        await client.client.lPush('test:messages', 'Hello');
        await client.client.lPush('test:messages', 'World');
        await client.client.lPush('test:messages', 'Redis');
        
        // Set
        await client.client.sAdd('test:tags', 'redis');
        await client.client.sAdd('test:tags', 'database');
        await client.client.sAdd('test:tags', 'cache');
        
        // Sorted Set
        await client.client.zAdd('test:scores', { score: 100, value: 'player1' });
        await client.client.zAdd('test:scores', { score: 85, value: 'player2' });
        await client.client.zAdd('test:scores', { score: 92, value: 'player3' });
        
        console.log('✅ Test data added successfully\n');
        
        // Test the improved getNamespaceSnapshot
        console.log('🔍 Testing getNamespaceSnapshot (handles all data types)...');
        const allData = await client.getNamespaceSnapshot('test');
        
        console.log('📊 Results:');
        console.log(JSON.stringify(allData, null, 2));
        console.log(`\n📈 Total items retrieved: ${Object.keys(allData).length}`);
        
        // Test the string-only version
        console.log('\n🔍 Testing getNamespaceStringValues (strings only)...');
        try {
            const stringData = await client.getNamespaceStringValues('test');
            console.log('📊 String-only results:');
            console.log(JSON.stringify(stringData, null, 2));
            console.log(`📈 String items retrieved: ${Object.keys(stringData).length}`);
        } catch (error) {
            console.log('⚠️  Expected error for non-string keys:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        // Clean up test data
        console.log('\n🧹 Cleaning up test data...');
        try {
            const testKeys = await client.getNamespace('test');
            for (const key of testKeys) {
                await client.client.del(key);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        
        client.destroy();
        console.log('✨ Test completed');
    }
}

// Run the test
testGetNamespaceSnapshot().catch(console.error);
