"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useSignMessage, useSwitchChain } from "wagmi";

import { arcDeployment, ARC_TESTNET_CHAIN_ID, formatCompactAddress } from "../../../lib/arc/hooks";
import { arcTestnet } from "../../../lib/chains/arc-testnet";
import {
  buildTokenChatApiPath,
  isChatApiError,
  isChatChallengeSuccess,
  isChatSessionSuccess,
  isTokenChatPostSuccess,
  isTokenChatSuccess,
  type ChatApiError,
  type TokenChatMessage,
  type TokenChatViewer
} from "../../../lib/chat/chat-api";
import { getChatPanelMode, mergeTokenChatMessages } from "../../../lib/chat/ui-state";
import { Button } from "../../ui/Button";
import { SurfaceCard } from "../../ui/SurfaceCard";
import { WalletConnectButton } from "../../wallet/WalletConnectButton";

type TokenChatPanelProps = {
  creatorAddress?: `0x${string}`;
  tokenAddress: `0x${string}`;
};

type ChatState =
  | { status: "loading" }
  | {
      status: "ready";
      messages: TokenChatMessage[];
      nextCursor?: string;
      totalCount?: number;
      viewer: TokenChatViewer;
    }
  | { status: "error"; error: ChatApiError };

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 60) {
    return relativeTimeFormatter.format(deltaSeconds, "second");
  }

  if (absoluteSeconds < 3_600) {
    return relativeTimeFormatter.format(Math.round(deltaSeconds / 60), "minute");
  }

  if (absoluteSeconds < 86_400) {
    return relativeTimeFormatter.format(Math.round(deltaSeconds / 3_600), "hour");
  }

  return relativeTimeFormatter.format(Math.round(deltaSeconds / 86_400), "day");
}

async function readJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw isChatApiError(payload)
      ? payload
      : ({
          ok: false,
          code: "CHAT_UNAVAILABLE",
          message: `The chat route returned HTTP ${response.status}.`,
          details: [
            {
              label: input,
              message: `The chat route returned HTTP ${response.status}.`
            }
          ]
        } satisfies ChatApiError);
  }

  return payload as T;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" role="status">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          className="animate-pulse rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
          key={index}
        >
          <div className="h-3 w-28 rounded bg-white/[0.05]" />
          <div className="mt-3 h-3 w-full rounded bg-white/[0.05]" />
          <div className="mt-2 h-3 w-2/3 rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

export function TokenChatPanel({ creatorAddress, tokenAddress }: TokenChatPanelProps) {
  const connection = useConnection();
  const { mutateAsync: signMessageAsync, isPending: isSignPending } = useSignMessage();
  const { mutateAsync: switchChainAsync, isPending: isSwitchPending } = useSwitchChain();
  const [composer, setComposer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [state, setState] = useState<ChatState>({ status: "loading" });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isConnected = connection.isConnected && Boolean(connection.address);
  const isWrongChain = isConnected && connection.chainId !== ARC_TESTNET_CHAIN_ID;
  const viewer =
    state.status === "ready"
      ? state.viewer
      : ({
          authenticated: false
        } satisfies TokenChatViewer);
  const mode = getChatPanelMode({
    authenticated: viewer.authenticated,
    available: !(state.status === "error" && state.error.code === "CHAT_UNAVAILABLE"),
    isConnected,
    isWrongChain
  });

  const loadLatest = useCallback(
    async ({
      merge = false,
      signal
    }: {
      merge?: boolean;
      signal?: AbortSignal;
    } = {}) => {
      try {
        if (!merge) {
          setState({ status: "loading" });
        }

        const payload = await readJson(buildTokenChatApiPath(tokenAddress), {
          signal
        });

        if (!isTokenChatSuccess(payload)) {
          throw {
            ok: false,
            code: "CHAT_UNAVAILABLE",
            message: "Unexpected token chat response.",
            details: [
              {
                label: "token chat",
                message: "Unexpected token chat response."
              }
            ]
          } satisfies ChatApiError;
        }

        setState((current) => ({
          status: "ready",
          messages:
            merge && current.status === "ready"
              ? mergeTokenChatMessages(current.messages, payload.messages)
              : payload.messages,
          nextCursor: payload.nextCursor,
          totalCount: payload.totalCount,
          viewer: payload.viewer
        }));
        setFeedback(null);
        if (!merge) {
          requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({
              block: "end"
            });
          });
        }
      } catch (error) {
        if (signal?.aborted) {
          return;
        }

        const chatError = isChatApiError(error)
          ? error
          : ({
              ok: false,
              code: "CHAT_UNAVAILABLE",
              message: error instanceof Error ? error.message : "Token chat is unavailable.",
              details: [
                {
                  label: "token chat",
                  message: error instanceof Error ? error.message : "Token chat is unavailable."
                }
              ]
            } satisfies ChatApiError);

        setState((current) => {
          if (merge && current.status === "ready") {
            setFeedback(chatError.message);
            return current;
          }

          return {
            status: "error",
            error: chatError
          };
        });
      }
    },
    [tokenAddress]
  );

  useEffect(() => {
    const abortController = new AbortController();

    setComposer("");
    setFeedback(null);
    setState({ status: "loading" });
    void loadLatest({
      signal: abortController.signal
    });

    return () => {
      abortController.abort();
    };
  }, [loadLatest, tokenAddress]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      void loadLatest({
        merge: true
      });
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadLatest, tokenAddress]);

  async function handleSignIn() {
    if (!connection.address) {
      return;
    }

    try {
      setFeedback("Signing in does not submit a transaction or spend tokens.");
      const challenge = await readJson("/api/chat/challenge", {
        body: JSON.stringify({
          chainId: ARC_TESTNET_CHAIN_ID,
          tokenAddress,
          walletAddress: connection.address
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!isChatChallengeSuccess(challenge)) {
        throw challenge;
      }

      const signature = await signMessageAsync({
        message: challenge.message
      });
      const session = await readJson("/api/chat/session", {
        body: JSON.stringify({
          message: challenge.message,
          signature
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!isChatSessionSuccess(session)) {
        throw session;
      }

      await loadLatest();
      setFeedback(null);
    } catch (error) {
      const chatError = isChatApiError(error)
        ? error
        : ({
            ok: false,
            code: "CHAT_AUTH_REQUIRED",
            message: error instanceof Error ? error.message : "Chat sign-in failed.",
            details: [
              {
                label: "chat sign-in",
                message: error instanceof Error ? error.message : "Chat sign-in failed."
              }
            ]
          } satisfies ChatApiError);

      setFeedback(chatError.message);
      if (chatError.code === "CHAT_SESSION_EXPIRED" || chatError.code === "CHAT_AUTH_REQUIRED") {
        setState((current) =>
          current.status === "ready"
            ? {
                ...current,
                viewer: {
                  authenticated: false
                }
              }
            : current
        );
      }
    }
  }

  async function handleSend() {
    if (!composer.trim()) {
      return;
    }

    try {
      setIsSending(true);
      const payload = await readJson(buildTokenChatApiPath(tokenAddress), {
        body: JSON.stringify({
          body: composer
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!isTokenChatPostSuccess(payload)) {
        throw payload;
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              messages: mergeTokenChatMessages(current.messages, [payload.message]),
              totalCount: (current.totalCount ?? current.messages.length) + 1,
              viewer: payload.viewer
            }
          : current
      );
      setComposer("");
      setFeedback(null);
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({
          block: "end"
        });
      });
    } catch (error) {
      const chatError = isChatApiError(error)
        ? error
        : ({
            ok: false,
            code: "CHAT_UNAVAILABLE",
            message: error instanceof Error ? error.message : "Unable to send the message.",
            details: [
              {
                label: "token chat",
                message: error instanceof Error ? error.message : "Unable to send the message."
              }
            ]
          } satisfies ChatApiError);

      setFeedback(chatError.message);
      if (chatError.code === "CHAT_SESSION_EXPIRED" || chatError.code === "CHAT_AUTH_REQUIRED") {
        setState((current) =>
          current.status === "ready"
            ? {
                ...current,
                viewer: {
                  authenticated: false
                }
              }
            : current
        );
      }
    } finally {
      setIsSending(false);
    }
  }

  async function handleLoadOlder() {
    if (state.status !== "ready" || !state.nextCursor) {
      return;
    }

    const container = scrollContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;

    try {
      setIsLoadingOlder(true);
      const payload = await readJson(
        buildTokenChatApiPath(tokenAddress, {
          cursor: state.nextCursor,
          limit: 30
        })
      );

      if (!isTokenChatSuccess(payload)) {
        throw payload;
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              messages: mergeTokenChatMessages(payload.messages, current.messages),
              nextCursor: payload.nextCursor,
              totalCount: payload.totalCount,
              viewer: payload.viewer
            }
          : current
      );

      requestAnimationFrame(() => {
        if (!container) {
          return;
        }

        const nextScrollHeight = container.scrollHeight;
        container.scrollTop += nextScrollHeight - previousScrollHeight;
      });
    } catch (error) {
      const chatError = isChatApiError(error)
        ? error
        : ({
            ok: false,
            code: "CHAT_UNAVAILABLE",
            message: error instanceof Error ? error.message : "Unable to load older messages.",
            details: [
              {
                label: "token chat",
                message: error instanceof Error ? error.message : "Unable to load older messages."
              }
            ]
          } satisfies ChatApiError);

      setFeedback(chatError.message);
    } finally {
      setIsLoadingOlder(false);
    }
  }

  async function handleSwitchNetwork() {
    await switchChainAsync({
      chainId: arcTestnet.id,
      addEthereumChainParameter: {
        blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
        chainName: arcTestnet.name,
        nativeCurrency: arcTestnet.nativeCurrency,
        rpcUrls: arcTestnet.rpcUrls.default.http
      }
    });
  }

  const messageCount = state.status === "ready" ? (state.totalCount ?? state.messages.length) : 0;

  return (
    <SurfaceCard
      className="flex min-h-[39rem] flex-col gap-4 border-[rgba(82,95,117,0.48)] bg-[linear-gradient(180deg,rgba(76,128,255,0.04),rgba(24,30,40,0.98)_16%,rgba(18,23,31,0.99))] xl:min-h-[44rem]"
      padding="md"
      tone="card"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Chat</p>
            <h2 className="mt-2 text-[1.12rem] font-semibold tracking-tight text-white">Chat</h2>
          </div>
          <span className="rounded-full border border-[rgba(82,95,117,0.44)] bg-[rgba(255,255,255,0.02)] px-3 py-1 text-sm font-semibold text-[var(--text-secondary)]">
            {messageCount}
          </span>
        </div>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Wallet-authenticated posts for this launch. Links are not allowed and chat never submits a
          transaction.
        </p>
      </div>

      {state.status === "loading" ? <LoadingSkeleton /> : null}

      {state.status === "error" ? (
        <div className="space-y-4 rounded-[var(--radius-md)] border border-[rgba(214,163,76,0.42)] bg-[rgba(214,163,76,0.08)] px-4 py-4">
          <p className="text-sm font-semibold text-white">
            {state.error.code === "CHAT_UNAVAILABLE"
              ? "Token chat is not configured yet."
              : state.error.message}
          </p>
          {state.error.code !== "CHAT_UNAVAILABLE" ? (
            <Button onClick={() => void loadLatest()} size="sm" variant="secondary">
              Retry reads
            </Button>
          ) : null}
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          {state.nextCursor ? (
            <div className="flex justify-start">
              <Button
                disabled={isLoadingOlder}
                onClick={() => void handleLoadOlder()}
                size="sm"
                variant="secondary"
              >
                {isLoadingOlder ? "Loading..." : "Load older"}
              </Button>
            </div>
          ) : null}

          <div
            aria-live="polite"
            className="min-h-0 flex-1 space-y-2.5 overflow-y-auto rounded-[1.1rem] border border-[rgba(82,95,117,0.38)] bg-[rgba(8,11,16,0.34)] p-3 pr-2"
            ref={scrollContainerRef}
          >
            {state.messages.length === 0 ? (
              <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[rgba(255,255,255,0.02)] px-4 py-5 text-sm leading-6 text-[var(--text-secondary)]">
                No messages yet. Start the discussion.
              </div>
            ) : null}

            {state.messages.map((message) => {
              const isCreator =
                creatorAddress &&
                message.walletAddress.toLowerCase() === creatorAddress.toLowerCase();

              return (
                <div
                  className="rounded-[0.95rem] border border-[rgba(82,95,117,0.4)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3"
                  key={message.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[rgba(76,128,255,0.12)] text-xs font-semibold text-white">
                          {message.walletAddress.slice(2, 4).toUpperCase()}
                        </span>
                        <Link
                          className="truncate text-sm font-semibold text-white transition hover:text-[var(--accent-strong)]"
                          href={`${arcDeployment.explorerUrl}/address/${message.walletAddress}`}
                          rel="noreferrer"
                          target="_blank"
                          title={message.walletAddress}
                        >
                          {formatCompactAddress(message.walletAddress)}
                        </Link>
                        {message.isHolder ? (
                          <span className="rounded-full border border-[rgba(109,196,143,0.28)] bg-[rgba(109,196,143,0.1)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--success)]">
                            Holder
                          </span>
                        ) : null}
                        {isCreator ? (
                          <span className="rounded-full border border-[rgba(50,108,255,0.28)] bg-[rgba(50,108,255,0.1)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                            Creator
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-xs text-[var(--text-faint)]"
                      title={message.createdAt}
                    >
                      {formatRelativeTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)]">
                    {message.body}
                  </p>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="space-y-3 border-t border-[var(--border-soft)] pt-4">
            {feedback ? (
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{feedback}</p>
            ) : null}

            {mode === "connect-wallet" ? (
              <div className="space-y-3 rounded-[1rem] border border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] p-4">
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  Connect a wallet to join the token discussion.
                </p>
                <WalletConnectButton />
              </div>
            ) : null}

            {mode === "switch-network" ? (
              <div className="space-y-3 rounded-[1rem] border border-[rgba(214,163,76,0.42)] bg-[rgba(214,163,76,0.08)] p-4">
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  Switch to Arc Testnet before signing in or posting in chat.
                </p>
                <Button disabled={isSwitchPending} onClick={() => void handleSwitchNetwork()}>
                  {isSwitchPending ? "Switching..." : "Switch to Arc Testnet"}
                </Button>
              </div>
            ) : null}

            {mode === "sign-in" ? (
              <div className="space-y-3 rounded-[1rem] border border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] p-4">
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  Signing in does not submit a transaction or spend tokens.
                </p>
                <Button disabled={isSignPending} onClick={() => void handleSignIn()}>
                  {isSignPending ? "Waiting for wallet..." : "Sign in to chat"}
                </Button>
              </div>
            ) : null}

            {mode === "authenticated" ? (
              <div className="space-y-3 rounded-[1rem] border border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] p-4">
                <label className="text-sm font-semibold text-white" htmlFor="token-chat-composer">
                  Message
                </label>
                <textarea
                  className="min-h-28 w-full rounded-[1rem] border border-[var(--border-soft)] bg-[rgba(8,11,16,0.42)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--border-strong)]"
                  id="token-chat-composer"
                  maxLength={500}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!isSending) {
                        void handleSend();
                      }
                    }
                  }}
                  placeholder="Share your view on this launch."
                  value={composer}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    {composer.trim().length} / 500
                  </span>
                  <Button
                    disabled={isSending || !composer.trim()}
                    onClick={() => void handleSend()}
                    size="sm"
                  >
                    {isSending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </SurfaceCard>
  );
}
