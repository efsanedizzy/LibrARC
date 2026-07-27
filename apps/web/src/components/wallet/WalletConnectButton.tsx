"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatUnits } from "viem";
import {
  BaseError,
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain
} from "wagmi";

import { arcTestnet } from "../../lib/chains/arc-testnet";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

function formatAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatBalance(value: bigint, decimals: number) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");

  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!error) {
    return null;
  }

  const baseMessage =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : fallback;
  const normalizedMessage = baseMessage.toLowerCase();

  if (
    normalizedMessage.includes("user rejected") ||
    normalizedMessage.includes("user denied") ||
    normalizedMessage.includes("rejected the request")
  ) {
    return "Request rejected in your wallet.";
  }

  if (
    normalizedMessage.includes("provider not found") ||
    normalizedMessage.includes("connector not found") ||
    normalizedMessage.includes("no ethereum provider")
  ) {
    return "No injected wallet was detected. Install or unlock MetaMask, Rabby, or Coinbase Wallet.";
  }

  if (normalizedMessage.includes("switch chain not supported")) {
    return "This wallet cannot switch networks from the app. Switch to Arc Testnet in the wallet extension.";
  }

  return baseMessage || fallback;
}

function getConnectorLabel(name: string) {
  if (name === "Injected") {
    return "Browser Wallet";
  }

  return name;
}

export function WalletConnectButton() {
  const panelId = useId();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [unavailableWalletMessage, setUnavailableWalletMessage] = useState<string | null>(null);

  const connection = useConnection();
  const connectors = useConnectors();
  const {
    error: connectError,
    isPending: isConnectPending,
    mutateAsync: connectAsync,
    reset: resetConnect
  } = useConnect();
  const {
    error: disconnectError,
    isPending: isDisconnectPending,
    mutateAsync: disconnectAsync
  } = useDisconnect();
  const {
    error: switchError,
    isPending: isSwitchPending,
    mutateAsync: switchChainAsync
  } = useSwitchChain();

  const address = connection.address;
  const isConnected = connection.isConnected;
  const isWrongNetwork = isConnected && connection.chainId !== arcTestnet.id;
  const uniqueConnectors = connectors.filter(
    (connector, index) =>
      connectors.findIndex(
        (candidate) => candidate.id === connector.id && candidate.name === connector.name
      ) === index
  );

  const balanceQuery = useBalance({
    address,
    chainId: arcTestnet.id,
    query: {
      enabled: Boolean(address),
      refetchInterval: 30_000
    }
  });

  const statusMessage =
    unavailableWalletMessage ??
    getErrorMessage(connectError, "Unable to connect wallet.") ??
    getErrorMessage(switchError, "Unable to switch to Arc Testnet.") ??
    getErrorMessage(disconnectError, "Unable to disconnect wallet.");

  async function handleConnect(connectorId: string) {
    const connector = uniqueConnectors.find((candidate) => candidate.uid === connectorId);

    if (!connector) {
      setUnavailableWalletMessage(
        "No injected wallet was detected. Install or unlock MetaMask, Rabby, or Coinbase Wallet."
      );
      setIsPanelOpen(true);
      return;
    }

    setUnavailableWalletMessage(null);
    resetConnect();

    try {
      await connectAsync({ connector });
      setIsPanelOpen(false);
    } catch {
      setIsPanelOpen(true);
    }
  }

  async function handleDisconnect() {
    setUnavailableWalletMessage(null);

    try {
      await disconnectAsync();
      setIsPanelOpen(false);
    } catch {
      setIsPanelOpen(true);
    }
  }

  async function handleSwitchNetwork() {
    setUnavailableWalletMessage(null);

    try {
      await switchChainAsync({
        chainId: arcTestnet.id,
        addEthereumChainParameter: {
          blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
          chainName: arcTestnet.name,
          nativeCurrency: arcTestnet.nativeCurrency,
          rpcUrls: arcTestnet.rpcUrls.default.http
        }
      });
    } catch {
      setIsPanelOpen(true);
    }
  }

  function handleDisconnectedClick() {
    setIsPanelOpen((current) => !current);

    if (uniqueConnectors.length === 0) {
      setUnavailableWalletMessage(
        "No injected wallet was detected. Install or unlock MetaMask, Rabby, or Coinbase Wallet."
      );
      return;
    }

    setUnavailableWalletMessage(null);
    resetConnect();
  }

  return (
    <div className="relative">
      {isConnected && address ? (
        <Button
          aria-controls={panelId}
          aria-expanded={isPanelOpen}
          className={isWrongNetwork ? "border-amber-300/40 text-amber-100" : ""}
          onClick={() => setIsPanelOpen((current) => !current)}
          size="sm"
          variant="secondary"
        >
          <span
            aria-hidden="true"
            className={[
              "h-2.5 w-2.5 rounded-full",
              isWrongNetwork
                ? "bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.75)]"
                : "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.75)]"
            ].join(" ")}
          />
          {formatAddress(address)}
        </Button>
      ) : (
        <Button
          aria-controls={panelId}
          aria-expanded={isPanelOpen}
          disabled={isConnectPending}
          onClick={handleDisconnectedClick}
          size="sm"
          variant="secondary"
        >
          {connection.isConnecting || isConnectPending ? "Connecting..." : "Connect Wallet"}
        </Button>
      )}

      {isPanelOpen ? (
        <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))]">
          <Card className="space-y-4 rounded-[1.5rem] border-white/12 bg-slate-950/95 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.65)]">
            {isConnected && address ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                      Wallet connected
                    </p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {formatAddress(address)}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]",
                      isWrongNetwork
                        ? "border border-amber-300/25 bg-amber-300/10 text-amber-100"
                        : "border border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                    ].join(" ")}
                  >
                    {isWrongNetwork ? "Wrong network" : "Arc ready"}
                  </span>
                </div>

                <dl className="space-y-3 rounded-2xl border border-white/10 bg-white/4 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-sm text-slate-400">Address</dt>
                    <dd className="text-sm font-medium text-white">{formatAddress(address)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-sm text-slate-400">Arc Testnet balance</dt>
                    <dd className="text-sm font-medium text-white">
                      {balanceQuery.isPending
                        ? "Loading..."
                        : balanceQuery.data
                          ? `${formatBalance(balanceQuery.data.value, balanceQuery.data.decimals)} ${balanceQuery.data.symbol}`
                          : "Unavailable"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-sm text-slate-400">Current network</dt>
                    <dd className="text-sm font-medium text-white">
                      {connection.chain?.name ?? "Unknown network"}
                    </dd>
                  </div>
                </dl>

                {isWrongNetwork ? (
                  <Button
                    disabled={isSwitchPending}
                    fullWidth
                    onClick={() => {
                      void handleSwitchNetwork();
                    }}
                    variant="primary"
                  >
                    {isSwitchPending ? "Switching..." : "Switch to Arc Testnet"}
                  </Button>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/12 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                    href={`${arcTestnet.blockExplorers.default.url}/address/${address}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View on ArcScan
                  </Link>
                  <Button
                    className="flex-1"
                    disabled={isDisconnectPending}
                    onClick={() => {
                      void handleDisconnect();
                    }}
                    variant="ghost"
                  >
                    {isDisconnectPending ? "Disconnecting..." : "Disconnect"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                    Injected wallets
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Connect with an EIP-1193 browser wallet like MetaMask, Rabby, or Coinbase
                    Wallet.
                  </p>
                </div>

                <div className="space-y-2">
                  {uniqueConnectors.length > 0 ? (
                    uniqueConnectors.map((connector) => (
                      <Button
                        fullWidth
                        key={connector.uid}
                        onClick={() => {
                          void handleConnect(connector.uid);
                        }}
                        variant="secondary"
                      >
                        {isConnectPending
                          ? "Connecting..."
                          : `Continue with ${getConnectorLabel(connector.name)}`}
                      </Button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                      No injected wallet detected. Install or unlock MetaMask, Rabby, or Coinbase
                      Wallet and try again.
                    </div>
                  )}
                </div>
              </>
            )}

            {statusMessage ? (
              <p className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {statusMessage}
              </p>
            ) : null}

            {balanceQuery.error ? (
              <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                {getErrorMessage(balanceQuery.error, "Unable to read Arc Testnet balance.")}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
