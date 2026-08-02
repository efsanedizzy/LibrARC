import { type Address } from "viem";

import { ARC_TESTNET_CHAIN_ID, parseAddress } from "../../lib/arc/config";
import { type ArcProfileSort } from "../../lib/arc/profile-api";

export type ProfileWalletState =
  | {
      mode: "disconnected";
    }
  | {
      mode: "invalid-wallet";
      rawAddress: string;
    }
  | {
      mode: "connected";
      address: Address;
      isWrongNetwork: boolean;
    };

export function resolveProfileWalletState({
  address,
  chainId,
  isConnected
}: {
  address?: string;
  chainId?: number;
  isConnected: boolean;
}): ProfileWalletState {
  if (!isConnected || !address) {
    return { mode: "disconnected" };
  }

  const parsedAddress = parseAddress(address);

  if (!parsedAddress) {
    return {
      mode: "invalid-wallet",
      rawAddress: address
    };
  }

  return {
    mode: "connected",
    address: parsedAddress,
    isWrongNetwork: chainId !== ARC_TESTNET_CHAIN_ID
  };
}

export function buildProfileRequestKey({
  limit,
  page,
  sort,
  walletAddress
}: {
  limit: number;
  page: number;
  sort: ArcProfileSort;
  walletAddress: Address;
}) {
  return `${walletAddress}:${page}:${limit}:${sort}`;
}
