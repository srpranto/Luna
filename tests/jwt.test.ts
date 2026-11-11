import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStationToken, verifyStationToken } from "../src/lib/jwt";

describe("Ephemeral Station JWT Authentication", () => {
  it("generates a valid 3-part JWT token format", async () => {
    const token = await createStationToken({
      deviceId: "dev-test-1234567890abcdef",
      callsign: "VEGA-99",
    });

    assert.equal(typeof token, "string");
    const parts = token.split(".");
    assert.equal(parts.length, 3);
  });

  it("verifies and extracts payload from a valid station token", async () => {
    const deviceId = "dev-station-alpha-001";
    const callsign = "NOVA-42";

    const token = await createStationToken({ deviceId, callsign }, 3600);
    const verified = await verifyStationToken(token, deviceId);

    assert.notEqual(verified, null);
    assert.equal(verified?.sub, deviceId);
    assert.equal(verified?.callsign, callsign);
    assert.ok(verified?.exp && verified.exp > Math.floor(Date.now() / 1000));
  });

  it("rejects token if expectedDeviceId does not match", async () => {
    const token = await createStationToken({
      deviceId: "dev-station-user-a",
      callsign: "USER-A",
    });

    const verified = await verifyStationToken(token, "dev-station-user-b");
    assert.equal(verified, null);
  });

  it("rejects tampered token signature", async () => {
    const token = await createStationToken({
      deviceId: "dev-station-secure",
      callsign: "SECURE",
    });

    const parts = token.split(".");
    // Tamper with the payload (middle segment)
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "dev-station-hacked", exp: 9999999999 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const verified = await verifyStationToken(tamperedToken);

    assert.equal(verified, null);
  });

  it("rejects expired station token", async () => {
    // Generate token that expired 10 seconds ago
    const token = await createStationToken(
      {
        deviceId: "dev-station-expired",
        callsign: "EXPIRED",
      },
      -10,
    );

    const verified = await verifyStationToken(token, "dev-station-expired");
    assert.equal(verified, null);
  });

  it("verifies in sub-millisecond time (<1ms) via mathematical Web Crypto", async () => {
    const token = await createStationToken({
      deviceId: "dev-perf-test",
      callsign: "SPEED",
    });

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      const v = await verifyStationToken(token, "dev-perf-test");
      assert.notEqual(v, null);
    }
    const elapsed = performance.now() - start;
    const avgPerVerify = elapsed / 50;

    assert.ok(
      avgPerVerify < 1.0,
      `Average verification should be < 1ms, got ${avgPerVerify.toFixed(3)}ms`,
    );
  });
});
