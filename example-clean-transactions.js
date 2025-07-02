#!/usr/bin/env node

/**
 * Example demonstrating clean transaction data retrieval
 * This shows how to avoid [Object: null prototype] issues
 */

import RedisClient from './index.js';

async function demonstrateCleanTransactionData() {
    const redisLocal = new RedisClient('transaction-demo');
    
    try {
        console.log('🔍 Getting transaction data from "tx" namespace...\n');
        
        // Method 1: Standard method (may show [Object: null prototype])
        console.log('📄 Method 1: Standard getNamespaceSnapshot()');
        const txs = await redisLocal.getNamespaceSnapshot('tx');
        
        console.log(`Found ${Object.keys(txs).length} transactions`);
        console.log('Sample transaction (first one):');
        const firstTxKey = Object.keys(txs)[0];
        if (firstTxKey) {
            console.log(`${firstTxKey}:`, txs[firstTxKey]);
        }
        
        // Method 2: Clean method (no prototype issues)
        console.log('\n✨ Method 2: Clean getNamespaceSnapshotClean()');
        const cleanTxs = await redisLocal.getNamespaceSnapshotClean('tx');
        
        console.log(`Found ${Object.keys(cleanTxs).length} clean transactions`);
        console.log('Sample clean transaction (first one):');
        if (firstTxKey) {
            console.log(`${firstTxKey}:`, JSON.stringify(cleanTxs[firstTxKey], null, 2));
        }
        
        // Method 3: Pretty formatted string output
        console.log('\n📝 Method 3: Pretty formatted output (for logging/debugging)');
        const prettyTxs = await redisLocal.getNamespaceSnapshotClean('tx', 100, true);
        
        // Show just first few lines for demo
        const lines = prettyTxs.split('\n');
        console.log('First 10 lines of pretty output:');
        console.log(lines.slice(0, 10).join('\n'));
        console.log('...');
        
        // Method 4: Processing for analysis
        console.log('\n📊 Method 4: Processing for analysis');
        const transactions = Object.entries(cleanTxs);
        console.log(`Total transactions: ${transactions.length}`);
        
        // Analyze transaction types
        const typeCount = {};
        transactions.forEach(([key, tx]) => {
            const type = tx.type || 'unknown';
            typeCount[type] = (typeCount[type] || 0) + 1;
        });
        
        console.log('Transaction types:');
        Object.entries(typeCount).forEach(([type, count]) => {
            console.log(`  Type ${type}: ${count} transactions`);
        });
        
        // Find high-value transactions (if value exists)
        const highValueTxs = transactions.filter(([key, tx]) => {
            const value = parseInt(tx.value || '0');
            return value > 1000000000000000; // > 0.001 ETH in wei
        });
        
        console.log(`\nHigh-value transactions (>0.001 ETH): ${highValueTxs.length}`);
        if (highValueTxs.length > 0) {
            console.log('Sample high-value transaction:');
            const [key, tx] = highValueTxs[0];
            console.log(`${key}: ${tx.value} wei from ${tx.from} to ${tx.to}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        redisLocal.destroy();
        console.log('\n✨ Demo completed');
    }
}

// Run the demonstration
demonstrateCleanTransactionData().catch(console.error);
