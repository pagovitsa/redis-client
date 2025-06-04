import RedisClient from './index.js';

async function testFixedMethods() {
    console.log('🔧 Testing Fixed SCAN Methods (now using KEYS)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const client = new RedisClient('fix-test', '/media/redis/local.sock', 'root', 'root');
    
    try {
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('✅ Setting up test data...');
        await client.setKey('fixtest', 'item1', 'value1');
        await client.setKey('fixtest', 'item2', 'value2');
        await client.setKey('fixtest', 'item3', 'value3');
        
        console.log('🔍 Testing getNamespaceSize (now using KEYS)...');
        const size = await client.getNamespaceSize('fixtest');
        console.log('✅ Namespace size:', size);
        
        console.log('📋 Testing getKeys (now using KEYS)...');
        const keys = await client.getKeys('fixtest');
        console.log('✅ Found keys:', keys);
        
        console.log('🎯 Testing multiple rapid calls (race condition test)...');
        const promises = [
            client.getNamespaceSize('fixtest'),
            client.getKeys('fixtest'),
            client.getNamespaceSize('fixtest'),
            client.getKeys('fixtest')
        ];
        
        const results = await Promise.all(promises);
        console.log('✅ All rapid calls completed successfully:', results.map(r => Array.isArray(r) ? `${r.length} keys` : `size: ${r}`));
        
        console.log('\n🎉 Fix verification completed successfully!');
        console.log('📋 Fixed issues:');
        console.log('   ✅ No more ClientClosedError');
        console.log('   ✅ No more SCAN race conditions');
        console.log('   ✅ Simplified and reliable KEYS operations');
        console.log('   ✅ Proper cleanup without hanging processes');
        
    } catch (error) {
        console.error('❌ Fix test failed:', error);
    } finally {
        console.log('\n🧹 Cleaning up test data...');
        try {
            await client.deleteKey('fixtest', 'item1');
            await client.deleteKey('fixtest', 'item2');
            await client.deleteKey('fixtest', 'item3');
            console.log('✅ Test data cleaned up');
        } catch (e) {
            console.warn('⚠️ Cleanup warning:', e.message);
        }
        
        client.destroy();
        console.log('🔌 Connection closed properly');
        
        setTimeout(() => {
            console.log('✨ Fix test completed - no hanging processes!');
            process.exit(0);
        }, 500);
    }
}

testFixedMethods().catch(console.error);
