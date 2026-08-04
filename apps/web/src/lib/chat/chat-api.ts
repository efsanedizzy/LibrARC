import { type Address } from "viem";

export const CHAT_API_ERROR_CODES = [
  "CHAT_AUTH_REQUIRED",
  "CHAT_MESSAGE_INVALID",
  "CHAT_RATE_LIMITED",
  "CHAT_SESSION_EXPIRED",
  "CHAT_UNAVAILABLE",
  "CONTRACT_READ_FAILED",
  "INVALID_ADDRESS",
  "INVALID_REQUEST",
  "RPC_UNAVAILABLE",
  "UNREGISTERED_TOKEN"
] as const;

export type ChatApiErrorCode = (typeof CHAT_API_ERROR_CODES)[number];

export type ChatApiIssue = {
  label: string;
  message: string;
};

export type ChatApiError = {
  ok: false;
  code: ChatApiErrorCode;
  message: string;
  details: ChatApiIssue[];
};

export type ChatChallengeSuccess = {
  ok: true;
  walletAddress: Address;
  tokenAddress?: Address;
  chainId: number;
  nonce: string;
  message: string;
  issuedAt: string;
  expirationTime: string;
};

export type ChatSessionSuccess = {
  ok: true;
  walletAddress: Address;
  tokenAddress?: Address;
  expiresAt: string;
};

export type TokenChatMessage = {
  id: string;
  walletAddress: Address;
  body: string;
  createdAt: string;
  isHolder?: boolean;
};

export type TokenChatViewer = {
  authenticated: boolean;
  expiresAt?: string;
  walletAddress?: Address;
};

export type TokenChatSuccess = {
  ok: true;
  messages: TokenChatMessage[];
  totalCount?: number;
  nextCursor?: string;
  viewer: TokenChatViewer;
};

export type TokenChatPostSuccess = {
  ok: true;
  message: TokenChatMessage;
  viewer: TokenChatViewer;
};

export type ChatChallengeResponse = ChatApiError | ChatChallengeSuccess;
export type ChatSessionResponse = ChatApiError | ChatSessionSuccess;
export type TokenChatResponse = ChatApiError | TokenChatSuccess;
export type TokenChatPostResponse = ChatApiError | TokenChatPostSuccess;

export function buildTokenChatApiPath(
  tokenAddress: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {}
) {
  const path = `/api/arc/token/${encodeURIComponent(tokenAddress)}/chat`;
  const searchParams = new URLSearchParams();

  if (options.cursor) {
    searchParams.set("cursor", options.cursor);
  }

  if (options.limit !== undefined) {
    searchParams.set("limit", String(options.limit));
  }

  const query = searchParams.toString();

  return query ? `${path}?${query}` : path;
}

export function isChatApiError(value: unknown): value is ChatApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ChatApiError>;

  return candidate.ok === false && typeof candidate.code === "string";
}

export function isChatChallengeSuccess(value: unknown): value is ChatChallengeSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ChatChallengeSuccess>;

  return candidate.ok === true && typeof candidate.message === "string";
}

export function isChatSessionSuccess(value: unknown): value is ChatSessionSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ChatSessionSuccess>;

  return candidate.ok === true && typeof candidate.walletAddress === "string";
}

export function isTokenChatSuccess(value: unknown): value is TokenChatSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TokenChatSuccess>;

  return candidate.ok === true && Array.isArray(candidate.messages);
}

export function isTokenChatPostSuccess(value: unknown): value is TokenChatPostSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TokenChatPostSuccess>;

  return candidate.ok === true && typeof candidate.message?.id === "string";
}
