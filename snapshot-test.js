import RedisClient from './index.js';

/**
 * Test the getNamespaceSnapshot method
 */
async function testNamespaceSnapshot() {
    console.log('🧪 Testing getNamespaceSnapshot() method...');
    const client = new RedisClient('test-client');
    
    try {
        // 1. Populate test data
        console.log('📝 Populating test data...');
        const testData = {};
        for (let i = 1; i <= 100; i++) {
            testData[`user${i}`] = {
                id: i,
                name: `User ${i}`,
                email: `user${i}@example.com`,
                createdAt: new Date().toISOString()
            };
        }
        
        await client.setBulk('users', testData);
        console.log(`✅ Added ${Object.keys(testData).length} test users`);
        
        // 2. Test getNamespaceSnapshot
        console.log('\n🔍 Testing getNamespaceSnapshot()...');
        console.time('Snapshot retrieval');
        const snapshot = await client.getNamespaceSnapshot('users');
        console.timeEnd('Snapshot retrieval');
        
        // 3. Verify results
        const snapshotSize = Object.keys(snapshot).length;
        console.log(`📊 Retrieved ${snapshotSize} users from snapshot`);
        
        // 4. Show sample results
        console.log('\n📋 Sample of user data:');
        const sampleKeys = Object.keys(snapshot).slice(0, 3);
        sampleKeys.forEach(key => {
            console.log(`${key}:`, snapshot[key]);
        });
        
        // 5. Test with custom batch size
        console.log('\n🔢 Testing with custom batch size...');
        console.time('Custom batch size (25)');
        const customBatchSnapshot = await client.getNamespaceSnapshot('users', 25);
        console.timeEnd('Custom batch size (25)');
        
        console.log(`📊 Retrieved ${Object.keys(customBatchSnapshot).length} users with custom batch size`);
        
        // 6. Clean up
        console.log('\n🧹 Cleaning up test data...');
        await client.deleteBulk('users', Object.keys(testData));
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        // Close the client
        client.destroy();
        console.log('\n✅ Test completed');
    }
}

// Run the test
testNamespaceSnapshot().catch(console.error);
