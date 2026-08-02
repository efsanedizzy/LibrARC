import "server-only";

import { type Address, type PublicClient } from "viem";

import { arcDeployment } from "./config";
import { isArcRpcTransportFailure, toArcRpcErrorMessage } from "./rpc-errors";
import { getArcTestnetServerPublicClient } from "./server-client";
import { type ArcTokenReadIssue } from "./token-api";

export type ArcHealthSuccess = {
  ok: true;
  chainId: number;
  factoryAddress: Address;
  latestBlock: string;
  rpcAvailable: true;
};

export type ArcHealthError = {
  ok: false;
  code: "RPC_UNAVAILABLE";
  details: ArcTokenReadIssue[];
  factoryAddress: Address;
  message: string;
  rpcAvailable: false;
};

export type ArcHealthResponse = ArcHealthSuccess | ArcHealthError;

type HealthClient = Pick<PublicClient, "getBlockNumber">;

export async function readArcHealthStatus(
  client: HealthClient = getArcTestnetServerPublicClient()
): Promise<ArcHealthResponse> {
  try {
    const latestBlock = await client.getBlockNumber();

    return {
      ok: true,
      chainId: arcDeployment.chainId,
      factoryAddress: arcDeployment.factoryAddress,
      latestBlock: latestBlock.toString(10),
      rpcAvailable: true
    };
  } catch (error) {
    return {
      ok: false,
      code: isArcRpcTransportFailure(error) ? "RPC_UNAVAILABLE" : "RPC_UNAVAILABLE",
      details: [
        {
          label: "Arc Testnet RPC",
          message: toArcRpcErrorMessage(error, "Arc Testnet RPC is temporarily unavailable.")
        }
      ],
      factoryAddress: arcDeployment.factoryAddress,
      message: "Arc Testnet RPC is temporarily unavailable.",
      rpcAvailable: false
    };
  }
}
