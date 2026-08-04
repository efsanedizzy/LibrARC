import { decodeEventLog, getAddress, type Address, type Hex } from "viem";

import { launchFactoryAbi } from "./abis";

export type CompactLaunchMetadata = {
  description?: string;
  name: string;
  socials?: {
    discord?: string;
    telegram?: string;
    x?: string;
  };
  symbol: string;
  website?: string;
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

export type CreatorInitialPurchaseExecutedEventResult = {
  creator: Address;
  launchId: string;
  launchPool: Address;
  recipient: Address;
  tokenAmountOut: string;
  usdcAmountIn: string;
};

export type ParsedLaunchMetadata = {
  description?: string;
  discord?: string;
  image?: string;
  telegram?: string;
  website?: string;
  warning?: {
    label: string;
    message: string;
  };
  x?: string;
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

function trimOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeHttpUrl(value: unknown) {
  const trimmed = trimOptionalString(value, 2_048);

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeDomainUrl(value: unknown, allowedHosts: readonly string[]) {
  const normalized = normalizeHttpUrl(value);

  if (!normalized) {
    return undefined;
  }

  const hostname = new URL(normalized).hostname.toLowerCase();

  if (!allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return undefined;
  }

  return normalized;
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

export function parseLaunchMetadataUri(
  metadataUri: string,
  { maxBytes = 4096 }: { maxBytes?: number } = {}
): ParsedLaunchMetadata {
  if (!metadataUri.startsWith("data:application/json,")) {
    return {};
  }

  const byteLength = getUtf8ByteLength(metadataUri);

  if (byteLength > maxBytes) {
    return {
      warning: {
        label: "Launch metadata",
        message: `The metadata URI exceeded the safe ${maxBytes}-byte decode limit.`
      }
    };
  }

  try {
    const encodedPayload = metadataUri.slice("data:application/json,".length);
    const decodedPayload = decodeURIComponent(encodedPayload);
    const parsed = JSON.parse(decodedPayload) as {
      description?: unknown;
      discord?: unknown;
      discordUrl?: unknown;
      image?: unknown;
      socials?: {
        discord?: unknown;
        telegram?: unknown;
        x?: unknown;
      };
      telegram?: unknown;
      telegramUrl?: unknown;
      twitter?: unknown;
      twitterUrl?: unknown;
      website?: unknown;
      websiteUrl?: unknown;
      x?: unknown;
      xUrl?: unknown;
    };
    const description = trimOptionalString(parsed.description, 500);
    const image = normalizeHttpUrl(parsed.image);
    const website = normalizeHttpUrl(parsed.website ?? parsed.websiteUrl);
    const x = normalizeDomainUrl(
      parsed.socials?.x ?? parsed.x ?? parsed.xUrl ?? parsed.twitter ?? parsed.twitterUrl,
      ["twitter.com", "x.com"]
    );
    const telegram = normalizeDomainUrl(
      parsed.socials?.telegram ?? parsed.telegram ?? parsed.telegramUrl,
      ["t.me", "telegram.me"]
    );
    const discord = normalizeDomainUrl(
      parsed.socials?.discord ?? parsed.discord ?? parsed.discordUrl,
      ["discord.com", "discord.gg"]
    );

    return {
      description,
      discord,
      image,
      telegram,
      website,
      x
    };
  } catch {
    return {
      warning: {
        label: "Launch metadata",
        message: "The metadata URI could not be decoded as trusted JSON display text."
      }
    };
  }
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

    try {
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
    } catch {
      continue;
    }
  }

  throw new Error("The LaunchCreated event was not found in the wallet receipt.");
}

export function decodeCreatorInitialPurchaseEventFromReceipt(
  receipt: WalletReceiptLike,
  factoryAddress: Address
): CreatorInitialPurchaseExecutedEventResult | null {
  for (const log of receipt.logs ?? []) {
    if (!log.address || !log.data || !log.topics || log.topics.length === 0) {
      continue;
    }

    if (getAddress(log.address) !== factoryAddress) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: launchFactoryAbi,
        data: log.data as Hex,
        eventName: "CreatorInitialPurchaseExecuted",
        topics: log.topics as [Hex, ...Hex[]]
      });
      const args = decoded.args;

      return {
        creator: getAddress(args.creator),
        launchId: args.launchId.toString(10),
        launchPool: getAddress(args.launchPool),
        recipient: getAddress(args.recipient),
        tokenAmountOut: args.tokenAmountOut.toString(10),
        usdcAmountIn: args.usdcAmountIn.toString(10)
      };
    } catch {
      continue;
    }
  }

  return null;
}
