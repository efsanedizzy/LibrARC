import { type ArcLaunchApiError } from "../../lib/arc/launch-api";
import { DEFAULT_SLIPPAGE_BPS } from "../../lib/arc/trading";
import { isWalletRejection } from "../../lib/arc/trading";
import { arcDeployment } from "../../lib/arc/config";
import type {
  LaunchFeedback,
  LaunchFeedbackPhase,
  LaunchFormValues,
  LaunchPartialSuccessState
} from "./types";

type LaunchSubmitStateInput = {
  hasConfirmedOutcome?: boolean;
  hasValidationErrors: boolean;
  hasVerifiedConfig: boolean;
  isConnected: boolean;
  isFactoryPaused: boolean;
  isSubmitting: boolean;
  isWrongChain: boolean;
  isLoadingConfig: boolean;
};

export const INITIAL_LAUNCH_FORM_VALUES: LaunchFormValues = {
  name: "",
  symbol: "",
  description: "",
  initialPurchaseEnabled: false,
  initialPurchaseAmount: ""
};

export const INITIAL_CUSTOM_SLIPPAGE_INPUT = "1.00";

export function isPendingLaunchPhase(phase: LaunchFeedbackPhase | null) {
  return (
    phase === "loading configuration" ||
    phase === "validating" ||
    phase === "approval required" ||
    phase === "approving" ||
    phase === "approval confirmed" ||
    phase === "simulating" ||
    phase === "wallet confirmation" ||
    phase === "transaction pending"
  );
}

export function getLaunchLivePhase({
  feedback,
  hasPartialSuccess,
  hasSuccess,
  isConnected,
  isLoadingConfig,
  isWrongChain
}: {
  feedback: LaunchFeedback | null;
  hasPartialSuccess: boolean;
  hasSuccess: boolean;
  isConnected: boolean;
  isLoadingConfig: boolean;
  isWrongChain: boolean;
}): LaunchFeedbackPhase {
  if (hasSuccess) {
    return "success";
  }

  if (hasPartialSuccess) {
    return "partial success";
  }

  if (feedback) {
    return feedback.phase;
  }

  if (isLoadingConfig) {
    return "loading configuration";
  }

  if (!isConnected) {
    return "disconnected";
  }

  if (isWrongChain) {
    return "wrong chain";
  }

  return "idle";
}

export function shouldClearLaunchFeedbackOnInputChange({
  feedback,
  hasConfirmedOutcome
}: {
  feedback: LaunchFeedback | null;
  hasConfirmedOutcome: boolean;
}) {
  if (!feedback || hasConfirmedOutcome) {
    return false;
  }

  return !isPendingLaunchPhase(feedback.phase);
}

export function createLaunchComposerResetState() {
  return {
    customSlippageInput: INITIAL_CUSTOM_SLIPPAGE_INPUT,
    feedback: null as LaunchFeedback | null,
    hasSubmitted: false,
    partialSuccess: null as LaunchPartialSuccessState | null,
    presetSlippageBps: DEFAULT_SLIPPAGE_BPS,
    slippageMode: "preset" as const,
    success: null,
    touchedFields: {},
    values: { ...INITIAL_LAUNCH_FORM_VALUES }
  };
}

export function createLaunchTransactionPendingFeedback(
  message: string,
  txHash: `0x${string}`
): LaunchFeedback {
  return {
    phase: "transaction pending",
    message,
    txHash
  };
}

export function createLaunchPartialSuccessState({
  error,
  initialPurchaseAmount,
  txHash
}: {
  error: unknown;
  initialPurchaseAmount?: string;
  txHash: `0x${string}`;
}): LaunchPartialSuccessState {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Receipt decoding failed.";

  return {
    factoryAddress: arcDeployment.factoryAddress,
    initialPurchaseAmount,
    message: "Transaction confirmed, but the new launch addresses could not be decoded.",
    receiptStatus: "confirmed",
    txHash,
    details: [
      {
        label: "Receipt decoding",
        message
      }
    ]
  };
}

export function getLaunchViewState({
  isConnected,
  isWrongChain,
  isLoadingConfig,
  isFactoryPaused,
  hasVerifiedConfig,
  hasValidationErrors,
  isSubmitting
}: LaunchSubmitStateInput): LaunchFeedbackPhase {
  if (!isConnected) {
    return "disconnected";
  }

  if (isWrongChain) {
    return "wrong chain";
  }

  if (isLoadingConfig || !hasVerifiedConfig) {
    return "loading configuration";
  }

  if (isSubmitting) {
    return "validating";
  }

  if (isFactoryPaused || hasValidationErrors) {
    return "idle";
  }

  return "idle";
}

export function getLaunchSubmitDisabledReason({
  hasConfirmedOutcome = false,
  hasValidationErrors,
  hasVerifiedConfig,
  isConnected,
  isFactoryPaused,
  isSubmitting,
  isWrongChain,
  isLoadingConfig
}: LaunchSubmitStateInput) {
  if (hasConfirmedOutcome) {
    return "Create another token to start a new launch.";
  }

  if (!isConnected) {
    return "Connect your browser wallet to create a launch.";
  }

  if (isWrongChain) {
    return "Switch your wallet to Arc Testnet before creating a launch.";
  }

  if (isLoadingConfig) {
    return "Loading the verified LaunchFactory configuration.";
  }

  if (!hasVerifiedConfig) {
    return "LaunchFactory configuration is unavailable right now.";
  }

  if (isFactoryPaused) {
    return "Launch creation is currently paused on the verified LaunchFactory.";
  }

  if (hasValidationErrors) {
    return "Fix the validation errors before creating a launch.";
  }

  if (isSubmitting) {
    return "A launch submission is already in progress.";
  }

  return null;
}

export function getLaunchFeedbackFromApiError(error: ArcLaunchApiError): LaunchFeedback {
  return {
    phase:
      error.code === "RPC_UNAVAILABLE"
        ? "rpc unavailable"
        : error.code === "SIMULATION_REVERTED"
          ? "contract reverted"
          : error.code === "INVALID_AMOUNT"
            ? "quote unavailable"
            : "contract reverted",
    message: error.revert?.reason || error.revert?.message || error.message,
    details: [
      ...error.details,
      ...(error.revert
        ? [
            {
              label: error.revert.errorName ?? error.revert.signature ?? "Revert",
              message: error.revert.message
            }
          ]
        : [])
    ]
  };
}

export function getLaunchFeedbackFromWalletError(error: unknown, fallback: string): LaunchFeedback {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : fallback;

  if (isWalletRejection(error)) {
    return {
      phase: "user rejected",
      message: "Request rejected in your browser wallet."
    };
  }

  return {
    phase: "contract reverted",
    message: message || fallback
  };
}
