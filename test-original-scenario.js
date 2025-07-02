#!/usr/bin/env node

/**
 * Test script to demonstrate the fix for the original error with 'tx' namespace
 */

import RedisClient from './index.js';

async function testOriginalScenario() {
    const redisLocal = new RedisClient('test-tx-scenario');
    
    try {
        console.log('🧪 Testing the original scenario with "tx" namespace...\n');
        
        // Clean up any existing tx data
        console.log('🧹 Cleaning up any existing tx data...');
        try {
            const existingKeys = await redisLocal.getNamespace('tx');
            for (const key of existingKeys) {
                await redisLocal.client.del(key);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        
        console.log('📝 Adding sample transaction data...');
        
        // Add some string data (what your client normally stores)
        await redisLocal.setKey('tx', 'tx1', { 
            id: 'tx1', 
            amount: 100, 
            from: 'user1', 
            to: 'user2',
            timestamp: Date.now()
        });
        
        await redisLocal.setKey('tx', 'tx2', { 
            id: 'tx2', 
            amount: 250, 
            from: 'user2', 
            to: 'user3',
            timestamp: Date.now() + 1000
        });
        
        // Let's also add some other data types that might have caused the original error
        await redisLocal._ensureClientConnected();
        
        // Maybe there was a hash or other type that caused the issue
        await redisLocal.client.hSet('tx:metadata', 'total_transactions', '2');
        await redisLocal.client.hSet('tx:metadata', 'last_update', Date.now().toString());
        
        console.log('✅ Sample data added successfully\n');
        
        // Now test the original problematic line
        console.log('🔍 Testing: const txs = await redisLocal.getNamespaceSnapshot("tx");');
        const txs = await redisLocal.getNamespaceSnapshot('tx');
        
        console.log('🎉 SUCCESS! No more WRONGTYPE errors!\n');
        console.log('📊 Transaction data retrieved:');
        console.log(JSON.stringify(txs, null, 2));
        console.log(`\n📈 Total items in tx namespace: ${Object.keys(txs).length}`);
        
    } catch (error) {
        console.error('❌ Error occurred:', error.message);
        console.error('Full error:', error);
    } finally {
        // Clean up
        console.log('\n🧹 Cleaning up...');
        try {
            const txKeys = await redisLocal.getNamespace('tx');
            for (const key of txKeys) {
                await redisLocal.client.del(key);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        
        redisLocal.destroy();
        console.log('✨ Test completed');
    }
}

// Run the test
testOriginalScenario().catch(console.error);
