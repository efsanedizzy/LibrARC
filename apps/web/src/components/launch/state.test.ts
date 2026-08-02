import assert from "node:assert/strict";
import test from "node:test";

import {
  getLaunchFeedbackFromApiError,
  getLaunchFeedbackFromWalletError,
  getLaunchSubmitDisabledReason
} from "./state";

test("disconnected wallet state blocks submission", () => {
  assert.equal(
    getLaunchSubmitDisabledReason({
      hasValidationErrors: false,
      hasVerifiedConfig: true,
      isConnected: false,
      isFactoryPaused: false,
      isSubmitting: false,
      isWrongChain: false,
      isLoadingConfig: false
    }),
    "Connect your browser wallet to create a launch."
  );
});

test("wrong chain state blocks submission", () => {
  assert.equal(
    getLaunchSubmitDisabledReason({
      hasValidationErrors: false,
      hasVerifiedConfig: true,
      isConnected: true,
      isFactoryPaused: false,
      isSubmitting: false,
      isWrongChain: true,
      isLoadingConfig: false
    }),
    "Switch your wallet to Arc Testnet before creating a launch."
  );
});

test("paused factory state blocks submission", () => {
  assert.equal(
    getLaunchSubmitDisabledReason({
      hasValidationErrors: false,
      hasVerifiedConfig: true,
      isConnected: true,
      isFactoryPaused: true,
      isSubmitting: false,
      isWrongChain: false,
      isLoadingConfig: false
    }),
    "Launch creation is currently paused on the verified LaunchFactory."
  );
});

test("simulation failures map to contract reverted feedback", () => {
  const feedback = getLaunchFeedbackFromApiError({
    ok: false,
    code: "SIMULATION_REVERTED",
    details: [
      {
        label: "LaunchFactory createLaunch()",
        message: "execution reverted"
      }
    ],
    message: "execution reverted"
  });

  assert.equal(feedback.phase, "contract reverted");
});

test("wallet rejection maps to the user rejected state", () => {
  const feedback = getLaunchFeedbackFromWalletError(
    {
      code: 4001,
      message: "User rejected the request."
    },
    "Launch failed."
  );

  assert.equal(feedback.phase, "user rejected");
});

test("duplicate submission prevention keeps the launch action disabled", () => {
  assert.equal(
    getLaunchSubmitDisabledReason({
      hasValidationErrors: false,
      hasVerifiedConfig: true,
      isConnected: true,
      isFactoryPaused: false,
      isSubmitting: true,
      isWrongChain: false,
      isLoadingConfig: false
    }),
    "A launch submission is already in progress."
  );
});
