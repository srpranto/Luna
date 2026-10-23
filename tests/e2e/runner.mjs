import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Self-register loader hook so Node resolves '@/...' and extensionless imports
try {
  register(pathToFileURL(path.resolve('tests/e2e/loader.mjs')).href, import.meta.url);
} catch {
  // Already registered or unsupported
}

// Suppress unhandled type warning noise in output
process.removeAllListeners('warning');

async function run() {
  const startSuiteTime = performance.now();
  console.log('===============================================================');
  console.log('   🌙 Luna Anonymous Chat: E2E Test Suite Runner');
  console.log('   Opaque-Box E2E Tests (Tiers 1, 2, 3, 4)');
  console.log('===============================================================\n');

  // Load test harness
  const { testRegistry, cleanDatabase } = await import('./harness.mjs');

  // Register all tiers
  const { registerTier1Tests } = await import('./tier1-features.mjs');
  const { registerTier2Tests } = await import('./tier2-boundaries.mjs');
  const { registerTier3Tests } = await import('./tier3-combinations.mjs');
  const { registerTier4Tests } = await import('./tier4-scenarios.mjs');

  registerTier1Tests();
  registerTier2Tests();
  registerTier3Tests();
  registerTier4Tests();

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const failures = [];

  const tierCounts = {
    'Tier 1': { passed: 0, total: 0 },
    'Tier 2': { passed: 0, total: 0 },
    'Tier 3': { passed: 0, total: 0 },
    'Tier 4': { passed: 0, total: 0 },
  };

  for (const suite of testRegistry.suites) {
    console.log(`\n▶ ${suite.name}`);
    let tierKey = 'Tier 1';
    if (suite.name.startsWith('Tier 2')) tierKey = 'Tier 2';
    else if (suite.name.startsWith('Tier 3')) tierKey = 'Tier 3';
    else if (suite.name.startsWith('Tier 4')) tierKey = 'Tier 4';

    for (const test of suite.tests) {
      totalTests += 1;
      tierCounts[tierKey].total += 1;
      await cleanDatabase();
      const testStart = performance.now();
      try {
        await test.fn();
        test.duration = Math.round(performance.now() - testStart);
        test.status = 'passed';
        totalPassed += 1;
        tierCounts[tierKey].passed += 1;
        console.log(`  ✓ ${test.name} (${test.duration}ms)`);
      } catch (err) {
        test.duration = Math.round(performance.now() - testStart);
        test.status = 'failed';
        test.error = err;
        totalFailed += 1;
        failures.push({ suite: suite.name, test: test.name, error: err });
        console.log(`  ✗ ${test.name} (${test.duration}ms)`);
        console.log(`     Error: ${err.message}`);
      }
    }
  }

  const totalDurationSec = ((performance.now() - startSuiteTime) / 1000).toFixed(2);

  console.log('\n===============================================================');
  console.log('                      TEST SUMMARY');
  console.log('===============================================================');
  console.log(` Tier 1 (Feature Coverage):        ${tierCounts['Tier 1'].passed} / ${tierCounts['Tier 1'].total} passed`);
  console.log(` Tier 2 (Boundary & Corner Cases): ${tierCounts['Tier 2'].passed} / ${tierCounts['Tier 2'].total} passed`);
  console.log(` Tier 3 (Cross-Feature Pairwise):  ${tierCounts['Tier 3'].passed} / ${tierCounts['Tier 3'].total} passed`);
  console.log(` Tier 4 (Real-World Scenarios):    ${tierCounts['Tier 4'].passed} / ${tierCounts['Tier 4'].total} passed`);
  console.log('---------------------------------------------------------------');
  console.log(` TOTAL:                            ${totalPassed} / ${totalTests} passed (${totalDurationSec}s)`);
  console.log('===============================================================');

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`\n• [${f.suite}] ${f.test}`);
      console.log(`  ${f.error.stack || f.error.message}`);
    }
    process.exit(1);
  }

  if (totalTests < 148) {
    console.error(`\nError: Required minimum of 148 tests not met (found ${totalTests}).`);
    process.exit(1);
  }

  console.log('\n✅ All tests passed cleanly with 100% success rate!\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
