import assert from "node:assert/strict";
import test from "node:test";

import { buildArcLaunchApiPath } from "./launch-api";
import { buildArcLaunchesApiPath } from "./launches-api";
import { buildArcProfileApiPath } from "./profile-api";
import { buildArcTokenApiPath } from "./token-api";

test("internal Arc links remain same-origin relative paths and never use localhost", () => {
  const paths = [
    buildArcLaunchApiPath("config"),
    buildArcLaunchApiPath("simulate"),
    buildArcLaunchesApiPath({ page: 2, limit: 12, sort: "newest" }),
    buildArcProfileApiPath("0x1111111111111111111111111111111111111111", {
      page: 2,
      limit: 12,
      sort: "oldest"
    }),
    buildArcTokenApiPath("0x2222222222222222222222222222222222222222")
  ];

  for (const path of paths) {
    assert.equal(path.startsWith("/"), true);
    assert.equal(path.includes("localhost"), false);
    assert.equal(path.includes("://"), false);
  }
});
