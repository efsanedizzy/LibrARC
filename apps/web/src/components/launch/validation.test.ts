import assert from "node:assert/strict";
import test from "node:test";

import { getAllErrors } from "./validation";

test("name is required", () => {
  const errors = getAllErrors(
    {
      name: "   ",
      symbol: "ARCN",
      description: "",
      initialPurchaseAmount: "",
      initialPurchaseEnabled: false
    },
    500
  );

  assert.equal(errors.name, "Token name is required.");
});

test("symbol is required", () => {
  const errors = getAllErrors(
    {
      name: "Arc Nova",
      symbol: "",
      description: "",
      initialPurchaseAmount: "",
      initialPurchaseEnabled: false
    },
    500
  );

  assert.equal(errors.symbol, "Token symbol is required.");
});

test("empty optional description is valid", () => {
  const errors = getAllErrors(
    {
      name: "Arc Nova",
      symbol: "ARCN",
      description: "",
      initialPurchaseAmount: "",
      initialPurchaseEnabled: false
    },
    500
  );

  assert.equal(errors.description, undefined);
});
