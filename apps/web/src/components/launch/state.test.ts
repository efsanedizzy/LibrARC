import assert from "node:assert/strict";
import test from "node:test";

import {
  createLaunchComposerResetState,
  createLaunchPartialSuccessState,
  createLaunchTransactionPendingFeedback,
  getLaunchFeedbackFromApiError,
  getLaunchLivePhase,
  getLaunchFeedbackFromWalletError,
  getLaunchSubmitDisabledReason,
  shouldClearLaunchFeedbackOnInputChange
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

test("confirmed launch outcomes keep the action disabled until reset", () => {
  assert.equal(
    getLaunchSubmitDisabledReason({
      hasConfirmedOutcome: true,
      hasValidationErrors: false,
      hasVerifiedConfig: true,
      isConnected: true,
      isFactoryPaused: false,
      isSubmitting: false,
      isWrongChain: false,
      isLoadingConfig: false
    }),
    "Create another token to start a new launch."
  );
});

test("transaction hash is retained in the pending launch feedback", () => {
  const feedback = createLaunchTransactionPendingFeedback(
    "Launch transaction submitted. Waiting for the Arc Testnet receipt.",
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );

  assert.equal(feedback.phase, "transaction pending");
  assert.equal(
    feedback.txHash,
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
});

test("confirmed receipts never fall back to idle when success is present", () => {
  assert.equal(
    getLaunchLivePhase({
      feedback: null,
      hasPartialSuccess: false,
      hasSuccess: true,
      isConnected: true,
      isLoadingConfig: false,
      isWrongChain: false
    }),
    "success"
  );
});

test("confirmed receipts expose partial success when decoding fails", () => {
  const partial = createLaunchPartialSuccessState({
    error: new Error("The LaunchCreated event was not found in the wallet receipt."),
    txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  });

  assert.equal(partial.receiptStatus, "confirmed");
  assert.equal(
    partial.message,
    "Transaction confirmed, but the new launch addresses could not be decoded."
  );
  assert.equal(partial.details?.[0]?.label, "Receipt decoding");
});

test("editing the form does not clear a confirmed launch outcome", () => {
  assert.equal(
    shouldClearLaunchFeedbackOnInputChange({
      feedback: {
        phase: "contract reverted",
        message: "Launch failed."
      },
      hasConfirmedOutcome: true
    }),
    false
  );
});

test("create another token resets the launch composer state explicitly", () => {
  const reset = createLaunchComposerResetState();

  assert.equal(reset.values.name, "");
  assert.equal(reset.values.symbol, "");
  assert.equal(reset.values.description, "");
  assert.equal(reset.values.initialPurchaseEnabled, false);
  assert.equal(reset.values.initialPurchaseAmount, "");
  assert.equal(reset.feedback, null);
  assert.equal(reset.success, null);
  assert.equal(reset.partialSuccess, null);
  assert.equal(reset.hasSubmitted, false);
});
