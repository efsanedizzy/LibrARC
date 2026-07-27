import { createConfig, http, injected } from "wagmi";

import { arcTestnet } from "./chains/arc-testnet";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 400
    })
  ],
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0])
  }
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
