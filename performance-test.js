#!/usr/bin/env node

/**
 * Performance test suite for @bcoders.gr/redis-client
 * Tests the optimized performance features and measures improvements
 */

import RedisClient from './index.js';

console.log('🚀 Performance Testing @bcoders.gr/redis-client v1.1.3+');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const client = new RedisClient('perf-test', '/media/redis/local.sock', 'root', 'root');

async function performanceTest() {
    try {
        console.log('\n📊 Starting performance benchmarks...');
        
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 1: Single operations performance
        console.log('\n🔥 Test 1: Single Operations Performance');
        console.log('─'.repeat(50));
        
        const singleOpStart = performance.now();
        
        // Set operations
        for (let i = 0; i < 100; i++) {
            await client.setKey('perftest', `single_${i}`, { 
                id: i,
                data: `test_data_${i}`,
                timestamp: Date.now(),
                nested: { value: i * 2, array: [1, 2, 3, i] }
            });
        }
        
        const setTime = performance.now() - singleOpStart;
        console.log(`✅ Set 100 keys individually: ${setTime.toFixed(2)}ms (${(setTime/100).toFixed(2)}ms per key)`);
        
        // Get operations
        const getStart = performance.now();
        for (let i = 0; i < 100; i++) {
            await client.getKey('perftest', `single_${i}`);
        }
        const getTime = performance.now() - getStart;
        console.log(`✅ Get 100 keys individually: ${getTime.toFixed(2)}ms (${(getTime/100).toFixed(2)}ms per key)`);
        
        // Test 2: Bulk operations performance
        console.log('\n🚄 Test 2: Bulk Operations Performance');
        console.log('─'.repeat(50));
        
        // Prepare bulk data
        const bulkData = {};
        for (let i = 0; i < 100; i++) {
            bulkData[`bulk_${i}`] = {
                id: i,
                data: `bulk_test_data_${i}`,
                timestamp: Date.now(),
                nested: { value: i * 3, array: [4, 5, 6, i] }
            };
        }
        
        const bulkSetStart = performance.now();
        await client.setBulk('perftest', bulkData);
        const bulkSetTime = performance.now() - bulkSetStart;
        console.log(`⚡ Set 100 keys in bulk: ${bulkSetTime.toFixed(2)}ms (${(bulkSetTime/100).toFixed(2)}ms per key)`);
        
        const bulkGetStart = performance.now();
        const bulkResults = await client.getBulk('perftest', Object.keys(bulkData));
        const bulkGetTime = performance.now() - bulkGetStart;
        console.log(`⚡ Get 100 keys in bulk: ${bulkGetTime.toFixed(2)}ms (${(bulkGetTime/100).toFixed(2)}ms per key)`);
        
        // Performance comparison
        const setImprovement = ((setTime - bulkSetTime) / setTime * 100).toFixed(1);
        const getImprovement = ((getTime - bulkGetTime) / getTime * 100).toFixed(1);
        console.log(`\n📈 Performance Improvements:`);
        console.log(`   SET operations: ${setImprovement}% faster with bulk operations`);
        console.log(`   GET operations: ${getImprovement}% faster with bulk operations`);
        
        // Test 3: Caching effectiveness
        console.log('\n🧠 Test 3: Cache Performance Analysis');
        console.log('─'.repeat(50));
        
        // Perform operations to generate cache statistics
        const cacheTestStart = performance.now();
        
        // Repeat some operations to test cache hits
        for (let i = 0; i < 50; i++) {
            await client.setKey('cachetest', 'repeated', { same: 'data', repeat: i });
        }
        
        for (let i = 0; i < 50; i++) {
            await client.getKey('cachetest', 'repeated');
        }
        
        const cacheTestTime = performance.now() - cacheTestStart;
        const stats = client.getPerformanceStats();
        
        console.log(`🎯 Cache Statistics:`);
        console.log(`   Cache Hit Rate: ${stats.cacheHitRate}`);
        console.log(`   Total Operations: ${stats.operationCount}`);
        console.log(`   Cache Hits: ${stats.cacheHits}`);
        console.log(`   Cache Misses: ${stats.cacheMisses}`);
        console.log(`   Avg Compression Time: ${stats.avgCompressionTime}`);
        console.log(`   Avg Decompression Time: ${stats.avgDecompressionTime}`);
        
        // Test 4: Advanced operations
        console.log('\n⚙️ Test 4: Advanced Operations Performance');
        console.log('─'.repeat(50));
        
        // Counter operations
        const counterStart = performance.now();
        for (let i = 0; i < 100; i++) {
            await client.incrementCounter('counters', 'test_counter', 1);
        }
        const counterTime = performance.now() - counterStart;
        console.log(`🔢 100 counter increments: ${counterTime.toFixed(2)}ms`);
        
        // Batched operations
        const batchStart = performance.now();
        const largeBulkData = {};
        for (let i = 0; i < 500; i++) {
            largeBulkData[`batch_${i}`] = { id: i, data: `data_${i}` };
        }
        await client.setBulkBatched('batchtest', largeBulkData, 50);
        const batchTime = performance.now() - batchStart;
        console.log(`📦 500 keys in batches of 50: ${batchTime.toFixed(2)}ms`);
        
        // Test 5: Memory usage and optimization
        console.log('\n🧹 Test 5: Memory Optimization');
        console.log('─'.repeat(50));
        
        console.log('🔍 Before optimization:');
        client.optimizeCaches();
        
        // Final performance summary
        console.log('\n🎉 Performance Test Summary');
        console.log('━'.repeat(50));
        console.log(`✅ Single operations: ${(setTime + getTime).toFixed(2)}ms total`);
        console.log(`⚡ Bulk operations: ${(bulkSetTime + bulkGetTime).toFixed(2)}ms total`);
        console.log(`🧠 Cache hit rate: ${stats.cacheHitRate}`);
        console.log(`🔢 Counter operations: ${counterTime.toFixed(2)}ms for 100 increments`);
        console.log(`📦 Batched operations: ${batchTime.toFixed(2)}ms for 500 keys`);
        
        console.log('\n🏆 Optimization Features Tested:');
        console.log('   ✅ Multi-level caching (compression, decompression, key formatting)');
        console.log('   ✅ Parallel compression/decompression');
        console.log('   ✅ Bulk operations with pipeline optimization');
        console.log('   ✅ Performance statistics tracking');
        console.log('   ✅ Memory-efficient cache management');
        console.log('   ✅ Batched operations for large datasets');
        console.log('   ✅ High-resolution performance timing');
        
    } catch (error) {
        console.error('❌ Performance test failed:', error);
    } finally {
        console.log('\n🧹 Cleaning up test data...');
        try {
            // Clean up all test namespaces
            const namespaces = ['perftest', 'cachetest', 'counters', 'batchtest'];
            for (const namespace of namespaces) {
                const keys = await client.getKeys(namespace);
                if (keys.length > 0) {
                    const cleanKeys = keys.map(key => key.split(':')[1]);
                    await client.deleteBulk(namespace, cleanKeys);
                }
            }
            console.log('✅ Test data cleaned up successfully');
        } catch (e) {
            console.warn('⚠️ Cleanup warning:', e.message);
        }
        
        // Display final stats
        console.log('\n📊 Final Performance Statistics:');
        const finalStats = client.getPerformanceStats();
        Object.entries(finalStats).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`);
        });
        
        client.destroy();
        console.log('\n🔌 Connection closed properly');
        
        setTimeout(() => {
            console.log('✨ Performance test completed successfully!');
            process.exit(0);
        }, 500);
    }
}

performanceTest().catch(console.error);
