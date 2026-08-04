import { getAddress, type Address } from "viem";

import { ARC_TESTNET_CHAIN_ID } from "../arc/config";
import { type ChatApiError, type ChatApiIssue, type TokenChatMessage } from "./chat-api";
import {
  buildChatSignInMessage,
  CHAT_NONCE_TTL_MS,
  CHAT_SESSION_TTL_MS,
  CHAT_STATEMENT,
  createChatNonce,
  createChatSessionToken,
  getChatSessionCookieOptions,
  hashChatSecret,
  normalizeChatAddress,
  parseChatSignInMessage,
  validateChatMessageBody,
  verifyChatSignature
} from "./auth";
import { type ChatStore, type StoredChatMessage } from "./store";

function toChatError(
  code: ChatApiError["code"],
  message: string,
  details: ChatApiIssue[],
  status: number
) {
  return {
    details,
    error: {
      ok: false,
      code,
      message,
      details
    } satisfies ChatApiError,
    status
  };
}

function ensureChatStore(store: ChatStore | null) {
  if (!store) {
    throw toChatError(
      "CHAT_UNAVAILABLE",
      "Token chat is not configured yet.",
      [
        {
          label: "DATABASE_URL",
          message: "Token chat is not configured yet."
        }
      ],
      503
    );
  }

  return store;
}

function normalizeOptionalTokenAddress(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return normalizeChatAddress(value, "token address");
}

function serializeStoredMessage(
  message: StoredChatMessage,
  holderWallets?: Set<string>
): TokenChatMessage {
  const walletAddress = getAddress(message.walletAddress);

  return {
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    id: message.id.toString(10),
    isHolder: holderWallets ? holderWallets.has(message.walletAddress) : undefined,
    walletAddress
  };
}

export async function issueChatChallenge(
  {
    chainId,
    domain,
    origin,
    tokenAddress,
    walletAddress
  }: {
    chainId: number;
    domain: string;
    origin: string;
    tokenAddress?: string;
    walletAddress: string;
  },
  store: ChatStore | null,
  now = new Date()
) {
  const chatStore = ensureChatStore(store);
  const normalizedWalletAddress = normalizeChatAddress(walletAddress);
  const normalizedTokenAddress = normalizeOptionalTokenAddress(tokenAddress);

  if (chainId !== ARC_TESTNET_CHAIN_ID) {
    throw toChatError(
      "INVALID_REQUEST",
      `Chat sign-in is only available on Arc Testnet (${ARC_TESTNET_CHAIN_ID}).`,
      [
        {
          label: "chainId",
          message: `Expected ${ARC_TESTNET_CHAIN_ID}, received ${chainId}.`
        }
      ],
      400
    );
  }

  const issuedAt = now.toISOString();
  const expirationTime = new Date(now.getTime() + CHAT_NONCE_TTL_MS).toISOString();
  const nonce = createChatNonce();
  const message = buildChatSignInMessage({
    address: normalizedWalletAddress,
    domain,
    expirationTime,
    issuedAt,
    nonce,
    origin,
    tokenAddress: normalizedTokenAddress
  });

  await chatStore.createNonce({
    chainId,
    expiresAt: new Date(expirationTime),
    nonceHash: hashChatSecret(nonce),
    tokenAddress: normalizedTokenAddress?.toLowerCase(),
    walletAddress: normalizedWalletAddress.toLowerCase()
  });

  return {
    chainId,
    expirationTime,
    issuedAt,
    message,
    nonce,
    tokenAddress: normalizedTokenAddress,
    walletAddress: normalizedWalletAddress
  };
}

export async function createChatSession(
  {
    expectedDomain,
    expectedOrigin,
    message,
    signature
  }: {
    expectedDomain: string;
    expectedOrigin: string;
    message: string;
    signature: `0x${string}`;
  },
  store: ChatStore | null,
  now = new Date()
) {
  const chatStore = ensureChatStore(store);
  const parsed = parseChatSignInMessage(message);
  const issuedAt = new Date(parsed.issuedAt);
  const expiresAt = new Date(parsed.expirationTime);

  if (
    parsed.domain !== expectedDomain ||
    parsed.origin !== expectedOrigin ||
    parsed.chainId !== ARC_TESTNET_CHAIN_ID ||
    parsed.statement !== CHAT_STATEMENT ||
    Number.isNaN(issuedAt.getTime()) ||
    Number.isNaN(expiresAt.getTime())
  ) {
    throw toChatError(
      "CHAT_AUTH_REQUIRED",
      "The sign-in message is invalid for this LibrARC origin.",
      [
        {
          label: "message",
          message: "The sign-in message is invalid for this LibrARC origin."
        }
      ],
      401
    );
  }

  if (expiresAt.getTime() <= now.getTime()) {
    throw toChatError(
      "CHAT_SESSION_EXPIRED",
      "The sign-in challenge has expired. Request a new signature challenge.",
      [
        {
          label: "expirationTime",
          message: "The sign-in challenge has expired."
        }
      ],
      401
    );
  }

  const isValid = await verifyChatSignature({
    address: parsed.address,
    message,
    signature
  });

  if (!isValid) {
    throw toChatError(
      "CHAT_AUTH_REQUIRED",
      "The wallet signature could not be verified.",
      [
        {
          label: "signature",
          message: "The wallet signature could not be verified."
        }
      ],
      401
    );
  }

  const nonceRecord = await chatStore.useNonce({
    chainId: parsed.chainId,
    nonceHash: hashChatSecret(parsed.nonce),
    walletAddress: parsed.address.toLowerCase()
  });

  if (!nonceRecord) {
    throw toChatError(
      "CHAT_SESSION_EXPIRED",
      "The sign-in challenge is no longer valid. Request a new signature challenge.",
      [
        {
          label: "nonce",
          message: "The challenge nonce was already used or has expired."
        }
      ],
      401
    );
  }

  const sessionToken = createChatSessionToken();
  const sessionExpiresAt = new Date(now.getTime() + CHAT_SESSION_TTL_MS);

  await chatStore.createSession({
    expiresAt: sessionExpiresAt,
    sessionTokenHash: hashChatSecret(sessionToken),
    walletAddress: parsed.address.toLowerCase()
  });

  return {
    cookie: {
      name: "librarc_chat_session",
      options: getChatSessionCookieOptions(sessionExpiresAt),
      value: sessionToken
    },
    expiresAt: sessionExpiresAt.toISOString(),
    tokenAddress: parsed.tokenAddress,
    walletAddress: parsed.address
  };
}

export async function getChatViewer(
  sessionToken: string | undefined,
  store: ChatStore | null,
  now = new Date()
) {
  if (!store || !sessionToken) {
    return {
      authenticated: false
    } as const;
  }

  const session = await store.getSessionByHash(hashChatSecret(sessionToken));

  if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
    return {
      authenticated: false
    } as const;
  }

  return {
    authenticated: true,
    expiresAt: session.expiresAt.toISOString(),
    walletAddress: getAddress(session.walletAddress)
  } as const;
}

export async function listTokenChatMessages(
  {
    cursor,
    limit,
    sessionToken,
    tokenAddress
  }: {
    cursor?: bigint | null;
    limit: number;
    sessionToken?: string;
    tokenAddress: Address;
  },
  store: ChatStore | null,
  options: {
    holderWallets?: Set<string>;
    now?: Date;
  } = {}
) {
  const chatStore = ensureChatStore(store);
  const viewer = await getChatViewer(sessionToken, chatStore, options.now);
  const result = await chatStore.listMessages({
    cursor,
    limit,
    tokenAddress: tokenAddress.toLowerCase()
  });

  return {
    messages: result.messages.map((message) =>
      serializeStoredMessage(message, options.holderWallets)
    ),
    nextCursor: result.hasMore ? result.messages[0]?.id.toString(10) : undefined,
    totalCount: result.totalCount,
    viewer
  };
}

export async function createTokenChatMessage(
  {
    body,
    sessionToken,
    tokenAddress
  }: {
    body: unknown;
    sessionToken?: string;
    tokenAddress: Address;
  },
  store: ChatStore | null,
  options: {
    holderWallets?: Set<string>;
    now?: Date;
  } = {}
) {
  const now = options.now ?? new Date();
  const chatStore = ensureChatStore(store);
  const viewer = await getChatViewer(sessionToken, chatStore, now);

  if (!viewer.authenticated || !viewer.walletAddress) {
    throw toChatError(
      "CHAT_AUTH_REQUIRED",
      "Connect a wallet and sign in to chat before posting.",
      [
        {
          label: "session",
          message: "A valid chat session is required before posting."
        }
      ],
      401
    );
  }

  const normalizedBody = validateChatMessageBody(body);
  const walletAddress = viewer.walletAddress.toLowerCase();
  const latestMessage = await chatStore.getLatestMessageByWallet(walletAddress);

  if (latestMessage && now.getTime() - latestMessage.createdAt.getTime() < 3_000) {
    throw toChatError(
      "CHAT_RATE_LIMITED",
      "Wait a few seconds before sending another message.",
      [
        {
          label: "rateLimit",
          message: "At least 3 seconds must pass between messages."
        }
      ],
      429
    );
  }

  const minuteCount = await chatStore.countMessagesSince({
    since: new Date(now.getTime() - 60_000),
    walletAddress
  });

  if (minuteCount >= 5) {
    throw toChatError(
      "CHAT_RATE_LIMITED",
      "You have reached the 5 messages per minute limit.",
      [
        {
          label: "rateLimit",
          message: "The per-minute message limit has been reached."
        }
      ],
      429
    );
  }

  const dayCount = await chatStore.countMessagesSince({
    since: new Date(now.getTime() - 86_400_000),
    walletAddress
  });

  if (dayCount >= 50) {
    throw toChatError(
      "CHAT_RATE_LIMITED",
      "You have reached the 50 messages per day limit.",
      [
        {
          label: "rateLimit",
          message: "The daily message limit has been reached."
        }
      ],
      429
    );
  }

  const message = await chatStore.createMessage({
    body: normalizedBody,
    tokenAddress: tokenAddress.toLowerCase(),
    walletAddress
  });

  return {
    message: serializeStoredMessage(message, options.holderWallets),
    viewer
  };
}
