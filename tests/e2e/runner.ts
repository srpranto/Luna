import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { performance } from "node:perf_hooks";

// Self-register loader hook so Node resolves '@/...' and extensionless imports
try {
  register(pathToFileURL(path.resolve("tests/e2e/loader.ts")).href, import.meta.url);
} catch {}

// Filter experimental module loader warnings while preserving runtime diagnostics
const origEmitWarning = process.emitWarning;
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const msg = typeof warning === "string" ? warning : warning?.message || "";
  if (msg.includes("Custom ESM Loaders") || msg.includes("ExperimentalWarning")) {
    return;
  }
  return (origEmitWarning as (...a: unknown[]) => void).apply(process, [warning, ...args]);
}) as typeof process.emitWarning;

async function run(): Promise<void> {
  const startSuiteTime = performance.now();
  console.log("===============================================================");
  console.log("   🌙 Luna Anonymous Chat: E2E Test Suite Runner");
  console.log("   Opaque-Box E2E Tests (Tiers 1, 2, 3, 4)");
  console.log("===============================================================\n");

  // Load test harness
  const { testRegistry, cleanDatabase } = await import("./harness.ts");

  // Register all tiers
  const { registerTier1Tests } = await import("./tier1-features.ts");
  const { registerTier2Tests } = await import("./tier2-boundaries.ts");
  const { registerTier3Tests } = await import("./tier3-combinations.ts");
  const { registerTier4Tests } = await import("./tier4-scenarios.ts");

  registerTier1Tests();
  registerTier2Tests();
  registerTier3Tests();
  registerTier4Tests();

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const failures: Array<{ suite: string; name: string; error: Error | null }> = [];

  const tierCounts: Record<string, { passed: number; total: number }> = {
    "Tier 1": { passed: 0, total: 0 },
    "Tier 2": { passed: 0, total: 0 },
    "Tier 3": { passed: 0, total: 0 },
    "Tier 4": { passed: 0, total: 0 },
  };

  for (const suite of testRegistry.suites) {
    console.log(`\n▶ ${suite.name}`);
    let tierKey = "Tier 1";
    if (suite.name.startsWith("Tier 2")) tierKey = "Tier 2";
    else if (suite.name.startsWith("Tier 3")) tierKey = "Tier 3";
    else if (suite.name.startsWith("Tier 4")) tierKey = "Tier 4";

    for (const test of suite.tests) {
      totalTests += 1;
      tierCounts[tierKey].total += 1;
      await cleanDatabase();
      const testStart = performance.now();
      try {
        await test.fn();
        test.status = "passed";
        test.duration = Math.round(performance.now() - testStart);
        totalPassed += 1;
        tierCounts[tierKey].passed += 1;
        console.log(`  ✓ ${test.name} (${test.duration}ms)`);
      } catch (err) {
        test.status = "failed";
        test.duration = Math.round(performance.now() - testStart);
        test.error = err instanceof Error ? err : new Error(String(err));
        totalFailed += 1;
        failures.push({ suite: suite.name, name: test.name, error: test.error });
        console.error(`  ✗ ${test.name} (${test.duration}ms)`);
        console.error(`    ${test.error.message}`);
      }
    }
  }

  const durationMs = Math.round(performance.now() - startSuiteTime);

  console.log("\n===============================================================");
  console.log("   📊 E2E Test Suite Execution Summary");
  console.log("===============================================================");
  for (const [tier, counts] of Object.entries(tierCounts)) {
    const rate = counts.total > 0 ? ((counts.passed / counts.total) * 100).toFixed(0) : "0";
    console.log(`   ${tier}: ${counts.passed}/${counts.total} passed (${rate}%)`);
  }
  console.log("---------------------------------------------------------------");
  console.log(`   TOTAL: ${totalPassed}/${totalTests} passed in ${durationMs}ms`);
  console.log("===============================================================\n");

  if (totalFailed > 0) {
    console.error(`❌ ${totalFailed} tests failed:\n`);
    for (const fail of failures) {
      console.error(`• [${fail.suite}] ${fail.name}`);
      console.error(`  ${fail.error?.message}\n`);
    }
    process.exit(1);
  } else {
    console.log("🎉 ALL E2E TESTS PASSED 100%!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("FATAL E2E RUNNER FAILURE:", err);
  process.exit(1);
});
