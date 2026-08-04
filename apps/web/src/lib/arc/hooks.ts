"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type Address } from "viem";
import { useConnection } from "wagmi";

import { ARC_TESTNET_CHAIN_ID, arcDeployment, parseAddress } from "./config";
import {
  buildExplorerAddressUrl,
  formatCompactAddress,
  formatCompactLaunchTokenAmount,
  formatCompactUsdcAmount,
  formatLaunchTokenAmount,
  formatPercentage,
  formatUsdcAmount,
  getPoolStatusLabel
} from "./format";
import {
  buildArcProfileApiPath,
  isArcProfileApiError,
  isArcProfileApiSuccess,
  type ArcProfileApiError,
  type ArcProfileApiSuccess,
  type ArcProfileSort
} from "./profile-api";
import {
  buildArcTokenApiPath,
  isArcTokenApiError,
  isArcTokenApiSuccess,
  type ArcTokenApiError,
  type ArcTokenApiSuccess
} from "./token-api";

type ArcTokenPageState =
  | {
      status: "invalid-address";
      tokenAddress: null;
    }
  | {
      status: "loading";
      tokenAddress: Address;
    }
  | {
      status: "error";
      tokenAddress: Address;
      error: ArcTokenApiError;
    }
  | {
      status: "unregistered";
      tokenAddress: Address;
      error: ArcTokenApiError;
    }
  | {
      status: "ready";
      tokenAddress: Address;
      data: ArcTokenApiSuccess;
    };

type ArcProfilePageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: ArcProfileApiError }
  | { status: "ready"; data: ArcProfileApiSuccess };

function toExplorerLink(address: Address) {
  return buildExplorerAddressUrl(arcDeployment.explorerUrl, address);
}

function toFallbackError(message: string, detail: string): ArcTokenApiError {
  return {
    ok: false,
    code: "RPC_UNAVAILABLE",
    message,
    details: [
      {
        label: "Token route",
        message: detail
      }
    ]
  };
}

function toProfileFallbackError(message: string, detail: string): ArcProfileApiError {
  return {
    ok: false,
    code: "RPC_UNAVAILABLE",
    message,
    details: [
      {
        label: "Profile route",
        message: detail
      }
    ]
  };
}

export function useArcTokenPageData(address: string) {
  const connection = useConnection();
  const tokenAddress = useMemo(() => parseAddress(address), [address]);
  const walletAddress = connection.address ?? undefined;
  const [retryNonce, setRetryNonce] = useState(0);
  const retry = useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);
  const [state, setState] = useState<ArcTokenPageState>(() =>
    tokenAddress
      ? { status: "loading", tokenAddress }
      : { status: "invalid-address", tokenAddress: null }
  );

  useEffect(() => {
    if (!tokenAddress) {
      setState({ status: "invalid-address", tokenAddress: null });
      return;
    }

    const requestTokenAddress = tokenAddress;
    const abortController = new AbortController();

    setState({
      status: "loading",
      tokenAddress: requestTokenAddress
    });

    async function loadTokenData() {
      try {
        const response = await fetch(buildArcTokenApiPath(requestTokenAddress, walletAddress), {
          cache: "no-store",
          headers: {
            accept: "application/json"
          },
          signal: abortController.signal
        });
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          const error = isArcTokenApiError(payload)
            ? payload
            : toFallbackError(
                "Unable to load Arc Testnet token data.",
                `The route returned HTTP ${response.status}.`
              );

          if (abortController.signal.aborted) {
            return;
          }

          setState(
            error.code === "TOKEN_NOT_REGISTERED"
              ? { status: "unregistered", tokenAddress: requestTokenAddress, error }
              : { status: "error", tokenAddress: requestTokenAddress, error }
          );
          return;
        }

        if (!isArcTokenApiSuccess(payload)) {
          if (abortController.signal.aborted) {
            return;
          }

          setState({
            status: "error",
            tokenAddress: requestTokenAddress,
            error: toFallbackError(
              "Unable to load Arc Testnet token data.",
              "The token route returned an unexpected response shape."
            )
          });
          return;
        }

        if (abortController.signal.aborted) {
          return;
        }

        setState({
          status: "ready",
          tokenAddress: requestTokenAddress,
          data: payload
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          tokenAddress: requestTokenAddress,
          error: toFallbackError(
            "Unable to load Arc Testnet token data.",
            error instanceof Error ? error.message : "The request was aborted or failed."
          )
        });
      }
    }

    void loadTokenData();

    return () => {
      abortController.abort();
    };
  }, [retryNonce, tokenAddress, walletAddress]);

  return {
    connection,
    retry,
    state
  };
}

export function useArcExplorerLinks(
  tokenAddress: Address | undefined,
  poolAddress: Address | undefined
) {
  return {
    tokenExplorerUrl: tokenAddress ? toExplorerLink(tokenAddress) : undefined,
    poolExplorerUrl: poolAddress ? toExplorerLink(poolAddress) : undefined,
    factoryExplorerUrl: toExplorerLink(arcDeployment.factoryAddress),
    feeVaultExplorerUrl: toExplorerLink(arcDeployment.feeVaultAddress),
    usdcExplorerUrl: toExplorerLink(arcDeployment.usdcAddress),
    stagingAdapterExplorerUrl: toExplorerLink(arcDeployment.stagingAdapterAddress)
  };
}

export function useArcProfilePageData({
  limit,
  page,
  sort,
  walletAddress
}: {
  limit: number;
  page: number;
  sort: ArcProfileSort;
  walletAddress: Address | null;
}) {
  const [retryNonce, setRetryNonce] = useState(0);
  const retry = useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);
  const [state, setState] = useState<ArcProfilePageState>({ status: "idle" });

  useEffect(() => {
    if (!walletAddress) {
      setState({ status: "idle" });
      return;
    }

    const requestWalletAddress = walletAddress;
    const abortController = new AbortController();

    setState({ status: "loading" });

    async function loadProfileData() {
      try {
        const response = await fetch(
          buildArcProfileApiPath(requestWalletAddress, {
            limit,
            page,
            sort
          }),
          {
            cache: "no-store",
            headers: {
              accept: "application/json"
            },
            signal: abortController.signal
          }
        );
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          const error = isArcProfileApiError(payload)
            ? payload
            : toProfileFallbackError(
                "Unable to load the Arc Testnet creator profile.",
                `The route returned HTTP ${response.status}.`
              );

          if (abortController.signal.aborted) {
            return;
          }

          setState({
            status: "error",
            error
          });
          return;
        }

        if (!isArcProfileApiSuccess(payload)) {
          if (abortController.signal.aborted) {
            return;
          }

          setState({
            status: "error",
            error: toProfileFallbackError(
              "Unable to load the Arc Testnet creator profile.",
              "The profile route returned an unexpected response shape."
            )
          });
          return;
        }

        if (abortController.signal.aborted) {
          return;
        }

        setState({
          status: "ready",
          data: payload
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          error: toProfileFallbackError(
            "Unable to load the Arc Testnet creator profile.",
            error instanceof Error ? error.message : "The request failed."
          )
        });
      }
    }

    void loadProfileData();

    return () => {
      abortController.abort();
    };
  }, [limit, page, retryNonce, sort, walletAddress]);

  return {
    retry,
    state
  };
}

export {
  ARC_TESTNET_CHAIN_ID,
  arcDeployment,
  formatCompactAddress,
  formatCompactLaunchTokenAmount,
  formatCompactUsdcAmount,
  formatLaunchTokenAmount,
  formatPercentage,
  formatUsdcAmount,
  getPoolStatusLabel
};
