import { type Address, type PublicClient } from "viem";

import { launchFactoryAbi } from "./abis";
import { arcDeployment, ARC_TESTNET_CHAIN_ID } from "./config";
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

type LaunchSimulationResult = {
  request: {
    account: Address;
    address: Address;
    args: [string, string, string];
    functionName: "createLaunch";
  };
  simulation: {
    launchId: bigint;
    launchPool: Address;
    launchToken: Address;
  };
};

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
  client: Pick<PublicClient, "simulateContract"> = getArcTestnetServerPublicClient()
): Promise<LaunchSimulationResult> {
  const { result } = await client.simulateContract({
    address: arcDeployment.factoryAddress,
    abi: launchFactoryAbi,
    functionName: "createLaunch",
    account,
    args: [name, symbol, metadataUri]
  });

  return {
    request: {
      account,
      address: arcDeployment.factoryAddress,
      functionName: "createLaunch",
      args: [name, symbol, metadataUri]
    },
    simulation: {
      launchToken: result[0],
      launchPool: result[1],
      launchId: result[2]
    }
  };
}
