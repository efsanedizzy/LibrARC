import { BaseError, ContractFunctionRevertedError } from "viem";

const TRANSPORT_FAILURE_FRAGMENTS = [
  "429",
  "500",
  "502",
  "503",
  "504",
  "bad gateway",
  "econn",
  "enotfound",
  "failed to fetch",
  "fetch failed",
  "gateway timeout",
  "http request failed",
  "network",
  "rate limit",
  "rate-limit",
  "rpc request failed",
  "service unavailable",
  "socket",
  "temporarily unavailable",
  "timed out",
  "timeout",
  "too many requests",
  "upstream"
] as const;

export function toArcRpcErrorMessage(error: unknown, fallback: string) {
  if (error instanceof BaseError) {
    return error.shortMessage || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

export function isArcDeterministicContractRevert(error: unknown) {
  if (!(error instanceof BaseError)) {
    return false;
  }

  return error.walk((walkError) => walkError instanceof ContractFunctionRevertedError) !== null;
}

export function isArcRpcTransportFailure(error: unknown) {
  if (isArcDeterministicContractRevert(error)) {
    return false;
  }

  const message = toArcRpcErrorMessage(error, "").toLowerCase();

  return TRANSPORT_FAILURE_FRAGMENTS.some((fragment) => message.includes(fragment));
}
