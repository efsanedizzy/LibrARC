import assert from "node:assert/strict";
import test from "node:test";

import { buildArcProfileApiPath } from "./profile-api";
import { ARC_FACTORY_DEPLOYMENT_BLOCK } from "./config";

test("builds the connected-wallet profile api path", () => {
  assert.equal(
    buildArcProfileApiPath("0x1111111111111111111111111111111111111111", {
      limit: 12,
      page: 2,
      sort: "oldest"
    }),
    "/api/arc/profile/0x1111111111111111111111111111111111111111?page=2&limit=12&sort=oldest"
  );
});

test("the verified Arc Testnet Factory deployment block is configured", () => {
  assert.equal(ARC_FACTORY_DEPLOYMENT_BLOCK, 54_593_744n);
});
