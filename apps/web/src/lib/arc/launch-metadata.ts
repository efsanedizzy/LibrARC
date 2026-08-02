import { decodeEventLog, getAddress, type Address, type Hex } from "viem";

import { launchFactoryAbi } from "./abis";

export type CompactLaunchMetadata = {
  description?: string;
  name: string;
  symbol: string;
};

export type LaunchMetadataInput = {
  description: string;
  name: string;
  symbol: string;
};

export type LaunchCreatedEventResult = {
  creator: Address;
  launchId: string;
  launchPool: Address;
  launchToken: Address;
  metadataHash: Hex;
  metadataUri: string;
  name: string;
  symbol: string;
};

type WalletReceiptLog = {
  address?: string;
  data?: string;
  topics?: string[];
};

type WalletReceiptLike = {
  logs?: WalletReceiptLog[];
};

export function createCompactLaunchMetadata({
  description,
  name,
  symbol
}: LaunchMetadataInput): CompactLaunchMetadata {
  const trimmedDescription = description.trim();
  const metadata: CompactLaunchMetadata = {
    name,
    symbol
  };

  if (trimmedDescription) {
    metadata.description = trimmedDescription;
  }

  return metadata;
}

export function stringifyLaunchMetadata(metadata: CompactLaunchMetadata) {
  return JSON.stringify(metadata);
}

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export function buildLaunchMetadata(input: LaunchMetadataInput) {
  const metadata = createCompactLaunchMetadata(input);
  const json = stringifyLaunchMetadata(metadata);
  const uri = `data:application/json,${encodeURIComponent(json)}`;

  return {
    metadata,
    json,
    uri,
    uriByteLength: getUtf8ByteLength(uri)
  };
}

export function exceedsLaunchMetadataLimit(actualLength: number, maxLength: number | null) {
  if (maxLength === null) {
    return false;
  }

  return actualLength > maxLength;
}

export function buildLaunchTokenPagePath(tokenAddress: Address) {
  return `/token/${tokenAddress}`;
}

export function buildArcScanAddressUrl(explorerUrl: string, address: Address) {
  return `${explorerUrl}/address/${address}`;
}

export function buildArcScanTransactionUrl(explorerUrl: string, hash: Hex) {
  return `${explorerUrl}/tx/${hash}`;
}

export function decodeLaunchCreatedEventFromReceipt(
  receipt: WalletReceiptLike,
  factoryAddress: Address
): LaunchCreatedEventResult {
  for (const log of receipt.logs ?? []) {
    if (!log.address || !log.data || !log.topics) {
      continue;
    }

    if (log.topics.length === 0) {
      continue;
    }

    if (getAddress(log.address) !== factoryAddress) {
      continue;
    }

    const decoded = decodeEventLog({
      abi: launchFactoryAbi,
      data: log.data as Hex,
      eventName: "LaunchCreated",
      topics: log.topics as [Hex, ...Hex[]]
    });

    const args = decoded.args;

    return {
      creator: getAddress(args.creator),
      launchId: args.launchId.toString(10),
      launchPool: getAddress(args.launchPool),
      launchToken: getAddress(args.launchToken),
      metadataHash: args.metadataHash,
      metadataUri: args.metadataUri,
      name: args.name,
      symbol: args.symbol
    };
  }

  throw new Error("The LaunchCreated event was not found in the wallet receipt.");
}
