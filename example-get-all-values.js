#!/usr/bin/env node

/**
 * Example demonstrating how to get all values from all keys in a namespace
 */

import RedisClient from './index.js';

async function demonstrateGetAllValues() {
    const client = new RedisClient('demo-all-values');
    
    try {
        // First, let's add some sample data to a namespace
        console.log('📝 Adding sample data...');
        await client.setKey('users', 'john', { name: 'John Doe', age: 30, email: 'john@example.com' });
        await client.setKey('users', 'jane', { name: 'Jane Smith', age: 25, email: 'jane@example.com' });
        await client.setKey('users', 'bob', { name: 'Bob Johnson', age: 35, email: 'bob@example.com' });
        
        console.log('✅ Sample data added successfully\n');
        
        // Method 1: Get all key-value pairs from namespace (RECOMMENDED)
        console.log('🔍 Method 1: Using getNamespaceSnapshot()');
        const allUsers = await client.getNamespaceSnapshot('users');
        console.log('All users data:', allUsers);
        console.log('Number of users:', Object.keys(allUsers).length);
        
        // Method 2: Get keys first, then get bulk values
        console.log('\n🔍 Method 2: Using getKeys() + getBulk()');
        const userKeys = await client.getKeys('users');
        console.log('User keys:', userKeys);
        
        // Extract clean keys (remove namespace prefix)
        const cleanKeys = userKeys.map(key => key.replace('users:', ''));
        const userValues = await client.getBulk('users', cleanKeys);
        console.log('User values:', userValues);
        
        // Method 3: Using batched approach for large datasets
        console.log('\n🔍 Method 3: Using getBulkBatched() for large datasets');
        const batchedUsers = await client.getBulkBatched('users', cleanKeys, 2); // Small batch for demo
        console.log('Batched user data:', batchedUsers);
        
        // Get namespace size
        console.log('\n📊 Namespace statistics:');
        const namespaceSize = await client.getNamespaceSize('users');
        console.log(`Total keys in 'users' namespace: ${namespaceSize}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        // Clean up
        console.log('\n🧹 Cleaning up...');
        await client.deleteKey('users', 'john');
        await client.deleteKey('users', 'jane');
        await client.deleteKey('users', 'bob');
        client.destroy();
        console.log('✨ Demo completed');
    }
}

// Run the demonstration
demonstrateGetAllValues().catch(console.error);
