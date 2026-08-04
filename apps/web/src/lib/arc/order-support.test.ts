import assert from "node:assert/strict";
import test from "node:test";

import { ARC_ORDER_SUPPORT, inspectArcOrderSupport } from "./order-support";

test("deployed Arc contracts expose no source-backed limit-order capability", () => {
  const support = inspectArcOrderSupport();

  assert.equal(support.supportsLimitOrders, false);
  assert.deepEqual(support.supportedFunctions, []);
  assert.deepEqual(support.supportedEvents, []);
  assert.ok(support.missingCapabilities.includes("placing limit orders"));
  assert.ok(support.missingCapabilities.includes("filled-order enumeration"));
});

test("shared order-support snapshot stays in sync with the inspected ABI result", () => {
  assert.deepEqual(ARC_ORDER_SUPPORT, inspectArcOrderSupport());
});
