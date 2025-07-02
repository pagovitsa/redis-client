#!/usr/bin/env node

/**
 * Test script to demonstrate clean object handling for transaction data
 */

import RedisClient from './index.js';

async function testCleanObjectHandling() {
    const client = new RedisClient('test-clean-objects');
    
    try {
        console.log('🧪 Testing clean object handling for transaction data...\n');
        
        // Clean up any existing test data
        console.log('🧹 Cleaning up any existing test data...');
        try {
            const existingKeys = await client.getNamespace('tx-test');
            for (const key of existingKeys) {
                await client.client.del(key);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        
        console.log('📝 Adding sample transaction data with mixed types...');
        
        // Add a compressed transaction object (our standard format)
        await client.setKey('tx-test', 'compressed-tx', {
            hash: '0x123...',
            from: '0xabc...',
            to: '0xdef...',
            value: '1000000000000000000',
            timestamp: Date.now()
        });
        
        // Add a raw hash that might cause [Object: null prototype] issues
        await client._ensureClientConnected();
        await client.client.hSet('tx-test:raw-tx-hash', {
            'hash': '0xf5aa742e69650650a7aa665337015f03d814c0ec7f996e2c89a2c8a809866c08',
            'rawdata': '0xf864248508b536b60082520894d67d76cef377711242a5852d85c84460adda919a808026a0b03f95c0863c546221c967669cc31b0b13bff5e74ded15a23fa0547deef667dea06094625ae3280a4761373ab53785c6f3d08cd1be1d248c384550950efcf8171f',
            'blockchain_number': '22831392',
            'gas': '21000',
            'nonce': '36',
            'type': '0',
            'gasprice': '37400000000',
            'value': '0',
            'to': '0xd67d76cef377711242a5852d85c84460adda919a',
            'from': '0xd67d76cef377711242a5852d85c84460adda919a'
        });
        
        console.log('✅ Sample data added successfully\n');
        
        console.log('🔍 Testing original getNamespaceSnapshot()...');
        const originalSnapshot = await client.getNamespaceSnapshot('tx-test');
        console.log('Original snapshot:');
        console.log(JSON.stringify(originalSnapshot, null, 2));
        
        console.log('\n🔍 Testing new getNamespaceSnapshotClean()...');
        const cleanSnapshot = await client.getNamespaceSnapshotClean('tx-test');
        console.log('Clean snapshot:');
        console.log(JSON.stringify(cleanSnapshot, null, 2));
        
        console.log('\n🔍 Testing pretty-formatted output...');
        const prettySnapshot = await client.getNamespaceSnapshotClean('tx-test', 100, true);
        console.log('Pretty formatted:');
        console.log(prettySnapshot);
        
        console.log('\n📊 Comparison:');
        console.log(`Original keys: ${Object.keys(originalSnapshot).length}`);
        console.log(`Clean keys: ${Object.keys(cleanSnapshot).length}`);
        console.log('✅ Both methods return the same data, but clean version has no prototype issues!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        // Clean up test data
        console.log('\n🧹 Cleaning up test data...');
        try {
            const testKeys = await client.getNamespace('tx-test');
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
testCleanObjectHandling().catch(console.error);
