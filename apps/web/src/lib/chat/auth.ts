import { createHash, randomBytes } from "node:crypto";

import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

import { ARC_TESTNET_CHAIN_ID, parseAddress } from "../arc/config";
import { type ChatApiError, type ChatApiErrorCode, type ChatApiIssue } from "./chat-api";

export const CHAT_NONCE_TTL_MS = 10 * 60 * 1000;
export const CHAT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const CHAT_SESSION_COOKIE_NAME = "librarc_chat_session";
export const CHAT_STATEMENT = "Signing in does not submit a transaction or spend tokens.";
export const CHAT_ALLOWED_MAX_MESSAGE_LENGTH = 500;
const CONTROL_CHARACTER_PATTERN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`
);

export type ParsedChatSignInMessage = {
  address: Address;
  chainId: number;
  domain: string;
  expirationTime: string;
  issuedAt: string;
  nonce: string;
  origin: string;
  statement: string;
  tokenAddress?: Address;
};

function toChatError(
  code: ChatApiErrorCode,
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

export function createChatNonce() {
  return randomBytes(18).toString("base64url");
}

export function createChatSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashChatSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeChatAddress(value: string, label = "wallet address") {
  if (!isAddress(value)) {
    throw toChatError(
      "INVALID_ADDRESS",
      `${label} must be a valid EVM address.`,
      [
        {
          label,
          message: `${label} must be a valid EVM address.`
        }
      ],
      400
    );
  }

  return getAddress(value);
}

export function buildChatSignInMessage({
  address,
  domain,
  expirationTime,
  issuedAt,
  nonce,
  origin,
  tokenAddress
}: {
  address: Address;
  domain: string;
  expirationTime: string;
  issuedAt: string;
  nonce: string;
  origin: string;
  tokenAddress?: Address;
}) {
  return [
    "LibrARC token chat sign-in",
    `Domain: ${domain}`,
    `Origin: ${origin}`,
    `Wallet: ${address}`,
    `Chain ID: ${ARC_TESTNET_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
    `Statement: ${CHAT_STATEMENT}`,
    `Token Scope: ${tokenAddress ?? "none"}`
  ].join("\n");
}

export function parseChatSignInMessage(message: string): ParsedChatSignInMessage {
  const [heading, ...lines] = message.split("\n");

  if (heading !== "LibrARC token chat sign-in") {
    throw new Error("The sign-in message heading is invalid.");
  }

  const values = new Map<string, string>();

  for (const line of lines) {
    const separatorIndex = line.indexOf(": ");

    if (separatorIndex === -1) {
      throw new Error("The sign-in message contains a malformed line.");
    }

    values.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 2));
  }

  const address = parseAddress(values.get("Wallet") ?? "");
  const tokenAddressValue = values.get("Token Scope");
  const tokenAddress =
    tokenAddressValue && tokenAddressValue !== "none" ? parseAddress(tokenAddressValue) : null;
  const chainId = Number(values.get("Chain ID"));

  if (!address || !Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("The sign-in message contains invalid account data.");
  }

  if (tokenAddressValue && tokenAddressValue !== "none" && !tokenAddress) {
    throw new Error("The sign-in message contains an invalid token scope.");
  }

  return {
    address,
    chainId,
    domain: values.get("Domain") ?? "",
    expirationTime: values.get("Expiration Time") ?? "",
    issuedAt: values.get("Issued At") ?? "",
    nonce: values.get("Nonce") ?? "",
    origin: values.get("Origin") ?? "",
    statement: values.get("Statement") ?? "",
    tokenAddress: tokenAddress ?? undefined
  };
}

export function validateChatMessageBody(body: unknown) {
  if (typeof body !== "string") {
    throw toChatError(
      "CHAT_MESSAGE_INVALID",
      "Chat messages must be provided as plain text.",
      [
        {
          label: "message",
          message: "Chat messages must be provided as plain text."
        }
      ],
      400
    );
  }

  const normalized = body.replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    throw toChatError(
      "CHAT_MESSAGE_INVALID",
      "Enter a message before sending.",
      [
        {
          label: "message",
          message: "Enter a message before sending."
        }
      ],
      400
    );
  }

  if (normalized.length > CHAT_ALLOWED_MAX_MESSAGE_LENGTH) {
    throw toChatError(
      "CHAT_MESSAGE_INVALID",
      `Messages must be ${CHAT_ALLOWED_MAX_MESSAGE_LENGTH} characters or fewer.`,
      [
        {
          label: "message",
          message: `Messages must be ${CHAT_ALLOWED_MAX_MESSAGE_LENGTH} characters or fewer.`
        }
      ],
      400
    );
  }

  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw toChatError(
      "CHAT_MESSAGE_INVALID",
      "Control characters are not allowed in chat messages.",
      [
        {
          label: "message",
          message: "Control characters are not allowed in chat messages."
        }
      ],
      400
    );
  }

  if (/<\/?[a-z][^>]*>/i.test(normalized)) {
    throw toChatError(
      "CHAT_MESSAGE_INVALID",
      "Raw HTML is not allowed in chat messages.",
      [
        {
          label: "message",
          message: "Raw HTML is not allowed in chat messages."
        }
      ],
      400
    );
  }

  if (/(https?:\/\/|www\.|\[[^\]]+\]\([^)]+\))/i.test(normalized)) {
    throw toChatError(
      "CHAT_MESSAGE_INVALID",
      "Links are not allowed in token chat yet.",
      [
        {
          label: "message",
          message: "Links are not allowed in token chat yet."
        }
      ],
      400
    );
  }

  return normalized;
}

export function getChatSessionCookieOptions(expiresAt: Date) {
  return {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function parseChatCursor(value: string | null) {
  if (!value) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    throw toChatError(
      "INVALID_REQUEST",
      "cursor must be a decimal-string message id.",
      [
        {
          label: "cursor",
          message: "cursor must be a decimal-string message id."
        }
      ],
      400
    );
  }

  return BigInt(value);
}

export function parseChatLimit(value: string | null, fallback = 30) {
  if (!value) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw toChatError(
      "INVALID_REQUEST",
      "limit must be an integer between 1 and 50.",
      [
        {
          label: "limit",
          message: "limit must be an integer between 1 and 50."
        }
      ],
      400
    );
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw toChatError(
      "INVALID_REQUEST",
      "limit must be between 1 and 50.",
      [
        {
          label: "limit",
          message: "limit must be between 1 and 50."
        }
      ],
      400
    );
  }

  return parsed;
}

export async function verifyChatSignature({
  address,
  message,
  signature
}: {
  address: Address;
  message: string;
  signature: Hex;
}) {
  return verifyMessage({
    address,
    message,
    signature
  });
}
