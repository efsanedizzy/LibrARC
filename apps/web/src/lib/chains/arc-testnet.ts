import { defineChain } from "viem";

import { ARC_TESTNET_CHAIN_ID, arcDeployment } from "../arc/config";

export const ARC_TESTNET_RPC_URL = arcDeployment.rpcUrl;
export const ARC_TESTNET_WS_URL = "wss://rpc.testnet.arc.network";
export const ARC_TESTNET_EXPLORER_URL = arcDeployment.explorerUrl;

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC_URL],
      webSocket: [ARC_TESTNET_WS_URL]
    },
    public: {
      http: [ARC_TESTNET_RPC_URL],
      webSocket: [ARC_TESTNET_WS_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: ARC_TESTNET_EXPLORER_URL
    }
  },
  testnet: true
});
