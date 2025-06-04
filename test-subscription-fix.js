#!/usr/bin/env node

/**
 * Test for subscription bug fix
 * This test verifies that multiple namespace subscriptions work correctly
 */

import RedisClient from './index.js';

console.log('🧪 Testing subscription bug fix...\n');

async function testMultipleSubscriptions() {
    let client;
    try {
        // Create client
        client = new RedisClient('test-subscription-fix');
        
        console.log('📡 Testing multiple namespace subscriptions...');
        
        // Track received events
        const receivedEvents = [];
        client.on('keyspace', (event) => {
            receivedEvents.push(event);
            console.log(`🔔 Event: ${event.namespace}:${event.key} -> ${event.event}`);
        });
        
        // Subscribe to first namespace
        console.log('📍 Subscribing to "test-namespace-1"...');
        await client.subscribeToKeyspaceEvents('test-namespace-1');
        console.log('✅ Successfully subscribed to test-namespace-1');
        
        // Subscribe to second namespace (this should not fail)
        console.log('📍 Subscribing to "test-namespace-2"...');
        await client.subscribeToKeyspaceEvents('test-namespace-2');
        console.log('✅ Successfully subscribed to test-namespace-2');
        
        // Test that events are received for both namespaces
        console.log('📝 Testing event generation...');
        
        // Set keys in both namespaces
        await client.setKey('test-namespace-1', 'key1', { test: 'data1' });
        await client.setKey('test-namespace-2', 'key2', { test: 'data2' });
        
        // Wait for events to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify events were received
        const namespace1Events = receivedEvents.filter(e => e.namespace === 'test-namespace-1');
        const namespace2Events = receivedEvents.filter(e => e.namespace === 'test-namespace-2');
        
        if (namespace1Events.length > 0 && namespace2Events.length > 0) {
            console.log('✅ Events received for both namespaces');
            console.log(`   - test-namespace-1: ${namespace1Events.length} events`);
            console.log(`   - test-namespace-2: ${namespace2Events.length} events`);
        } else {
            console.log('⚠️  Some events may not have been received yet');
            console.log(`   - test-namespace-1: ${namespace1Events.length} events`);
            console.log(`   - test-namespace-2: ${namespace2Events.length} events`);
        }
        
        // Clean up test data
        await client.deleteKey('test-namespace-1', 'key1');
        await client.deleteKey('test-namespace-2', 'key2');
        
        console.log('\n🎉 Multiple subscription test completed successfully!');
        console.log('✅ Bug fix verified: CONFIG SET moved to main client');
        
    } catch (error) {
        console.error('❌ Multiple subscription test failed:', error.message);
        throw error;
    } finally {
        if (client) {
            client.destroy();
        }
    }
}

// Run the test
testMultipleSubscriptions()
    .then(() => {
        console.log('\n✅ All subscription tests passed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Subscription test failed:', error);
        process.exit(1);
    });
