import { type Address, type PublicClient } from "viem";

import { launchFactoryAbi, launchFactorySimulationAbi } from "./abis";
import { arcDeployment, ARC_TESTNET_CHAIN_ID } from "./config";
import {
  createInitialLaunchCurveState,
  LaunchInitialBuyQuoteError,
  quoteInitialLaunchBuy,
  type LaunchInitialBuyQuote
} from "./launch-buy";
import { getArcTestnetServerPublicClient } from "./server-client";
import { readWithRetry } from "./server-routes";

export type ArcLaunchServerConfig = {
  chainId: number;
  explorerUrl: string;
  factory: {
    address: Address;
    buyFeeBps: bigint;
    feeVault: Address;
    graduationThreshold: bigint;
    launchCount: bigint;
    liquidityAdapter: Address;
    liquidityRecipient: Address;
    maxMetadataUriLength: bigint;
    paused: boolean;
    quoteAsset: Address;
    sellFeeBps: bigint;
    virtualTokenReserve: bigint;
    virtualUsdcReserve: bigint;
  };
};

export type LaunchSimulationMode = "createLaunch" | "createLaunchAndBuy";

export type LaunchSimulationResult = {
  mode: LaunchSimulationMode;
  request: {
    account: Address;
    address: Address;
    args: [string, string, string] | [string, string, string, bigint, bigint, bigint, Address];
    functionName: LaunchSimulationMode;
  };
  simulation: {
    launchId: bigint;
    launchPool: Address;
    launchToken: Address;
    tokenAmountOut?: bigint;
  };
};

export type LaunchRequestValidationInput = {
  maxMetadataUriLength: bigint;
  metadataUri: string;
  name: string;
  symbol: string;
};

function ensureLaunchTextField(value: string, fieldName: string) {
  if (!value.trim()) {
    throw new Error(`${fieldName} must not be empty.`);
  }

  return value;
}

export function validateLaunchRequestInput({
  maxMetadataUriLength,
  metadataUri,
  name,
  symbol
}: LaunchRequestValidationInput) {
  ensureLaunchTextField(name, "name");
  ensureLaunchTextField(symbol, "symbol");

  if (!metadataUri) {
    throw new Error("metadataUri must not be empty.");
  }

  const metadataLength = new TextEncoder().encode(metadataUri).length;

  if (metadataLength > Number(maxMetadataUriLength)) {
    throw new Error(
      `metadataUri exceeds the LaunchFactory limit of ${maxMetadataUriLength.toString(10)} bytes.`
    );
  }
}

export async function readLaunchFactoryConfig(
  client: Pick<PublicClient, "readContract"> = getArcTestnetServerPublicClient()
): Promise<ArcLaunchServerConfig> {
  const [
    paused,
    quoteAsset,
    feeVault,
    liquidityAdapter,
    liquidityRecipient,
    buyFeeBps,
    sellFeeBps,
    graduationThreshold,
    virtualUsdcReserve,
    virtualTokenReserve,
    maxMetadataUriLength,
    launchCount
  ] = await Promise.all([
    readWithRetry("Factory paused()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "paused"
      })
    ),
    readWithRetry("Factory quoteAsset()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "quoteAsset"
      })
    ),
    readWithRetry("Factory feeVault()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "feeVault"
      })
    ),
    readWithRetry("Factory liquidityAdapter()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "liquidityAdapter"
      })
    ),
    readWithRetry("Factory liquidityRecipient()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "liquidityRecipient"
      })
    ),
    readWithRetry("Factory buyFeeBps()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "buyFeeBps"
      })
    ),
    readWithRetry("Factory sellFeeBps()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "sellFeeBps"
      })
    ),
    readWithRetry("Factory graduationThreshold()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "graduationThreshold"
      })
    ),
    readWithRetry("Factory virtualUsdcReserve()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "virtualUsdcReserve"
      })
    ),
    readWithRetry("Factory virtualTokenReserve()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "virtualTokenReserve"
      })
    ),
    readWithRetry("Factory maxMetadataUriLength()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "maxMetadataUriLength"
      })
    ),
    readWithRetry("Factory launchCount()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "launchCount"
      })
    )
  ]);

  return {
    chainId: ARC_TESTNET_CHAIN_ID,
    explorerUrl: arcDeployment.explorerUrl,
    factory: {
      address: arcDeployment.factoryAddress,
      paused,
      quoteAsset,
      feeVault,
      liquidityAdapter,
      liquidityRecipient,
      buyFeeBps,
      sellFeeBps,
      graduationThreshold,
      virtualUsdcReserve,
      virtualTokenReserve,
      maxMetadataUriLength,
      launchCount
    }
  };
}

export async function quoteInitialLaunchPurchase(
  {
    metadataUri,
    name,
    symbol,
    usdcAmountIn
  }: {
    metadataUri: string;
    name: string;
    symbol: string;
    usdcAmountIn: bigint;
  },
  client: Pick<PublicClient, "readContract"> = getArcTestnetServerPublicClient()
): Promise<{
  config: ArcLaunchServerConfig;
  quote: LaunchInitialBuyQuote;
}> {
  const config = await readLaunchFactoryConfig(client);

  validateLaunchRequestInput({
    name,
    symbol,
    metadataUri,
    maxMetadataUriLength: config.factory.maxMetadataUriLength
  });

  const state = createInitialLaunchCurveState({
    virtualUsdcReserve: config.factory.virtualUsdcReserve,
    virtualTokenReserve: config.factory.virtualTokenReserve
  });
  const quote = quoteInitialLaunchBuy({
    state,
    usdcAmountIn,
    buyFeeBps: config.factory.buyFeeBps,
    graduationThreshold: config.factory.graduationThreshold
  });

  return { config, quote };
}

export async function simulateLaunchTransaction(
  input:
    | {
        account: Address;
        metadataUri: string;
        mode: "createLaunch";
        name: string;
        symbol: string;
      }
    | {
        account: Address;
        deadline: bigint;
        metadataUri: string;
        minTokenAmountOut: bigint;
        mode: "createLaunchAndBuy";
        name: string;
        symbol: string;
        usdcAmountIn: bigint;
      },
  client: Pick<
    PublicClient,
    "readContract" | "simulateContract"
  > = getArcTestnetServerPublicClient()
): Promise<LaunchSimulationResult> {
  const config = await readLaunchFactoryConfig(client);

  validateLaunchRequestInput({
    name: input.name,
    symbol: input.symbol,
    metadataUri: input.metadataUri,
    maxMetadataUriLength: config.factory.maxMetadataUriLength
  });

  if (input.mode === "createLaunch") {
    const { result } = await client.simulateContract({
      address: arcDeployment.factoryAddress,
      abi: launchFactorySimulationAbi,
      functionName: "createLaunch",
      account: input.account,
      args: [input.name, input.symbol, input.metadataUri]
    });

    return {
      mode: "createLaunch",
      request: {
        account: input.account,
        address: arcDeployment.factoryAddress,
        functionName: "createLaunch",
        args: [input.name, input.symbol, input.metadataUri]
      },
      simulation: {
        launchToken: result[0],
        launchPool: result[1],
        launchId: result[2]
      }
    };
  }

  const { result } = await client.simulateContract({
    address: arcDeployment.factoryAddress,
    abi: launchFactorySimulationAbi,
    functionName: "createLaunchAndBuy",
    account: input.account,
    args: [
      input.name,
      input.symbol,
      input.metadataUri,
      input.usdcAmountIn,
      input.minTokenAmountOut,
      input.deadline,
      input.account
    ]
  });

  return {
    mode: "createLaunchAndBuy",
    request: {
      account: input.account,
      address: arcDeployment.factoryAddress,
      functionName: "createLaunchAndBuy",
      args: [
        input.name,
        input.symbol,
        input.metadataUri,
        input.usdcAmountIn,
        input.minTokenAmountOut,
        input.deadline,
        input.account
      ]
    },
    simulation: {
      launchToken: result[0],
      launchPool: result[1],
      launchId: result[2],
      tokenAmountOut: result[3]
    }
  };
}

export async function simulateCreateLaunchTransaction(
  {
    account,
    metadataUri,
    name,
    symbol
  }: {
    account: Address;
    metadataUri: string;
    name: string;
    symbol: string;
  },
  client: Pick<
    PublicClient,
    "readContract" | "simulateContract"
  > = getArcTestnetServerPublicClient()
): Promise<LaunchSimulationResult> {
  return simulateLaunchTransaction(
    {
      account,
      metadataUri,
      mode: "createLaunch",
      name,
      symbol
    },
    client
  );
}

export { LaunchInitialBuyQuoteError };
