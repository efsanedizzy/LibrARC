import { type ArcLaunchApiError } from "../../lib/arc/launch-api";
import { isWalletRejection } from "../../lib/arc/trading";
import type { LaunchFeedback, LaunchFeedbackPhase } from "./types";

type LaunchSubmitStateInput = {
  hasValidationErrors: boolean;
  hasVerifiedConfig: boolean;
  isConnected: boolean;
  isFactoryPaused: boolean;
  isSubmitting: boolean;
  isWrongChain: boolean;
  isLoadingConfig: boolean;
};

export function isPendingLaunchPhase(phase: LaunchFeedbackPhase | null) {
  return (
    phase === "loading configuration" ||
    phase === "validating" ||
    phase === "simulating" ||
    phase === "wallet confirmation" ||
    phase === "transaction pending"
  );
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
  hasValidationErrors,
  hasVerifiedConfig,
  isConnected,
  isFactoryPaused,
  isSubmitting,
  isWrongChain,
  isLoadingConfig
}: LaunchSubmitStateInput) {
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
