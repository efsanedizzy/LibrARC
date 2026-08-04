import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import { ARC_TESTNET_CHAIN_ID } from "../arc/config";
import {
  buildChatSignInMessage,
  CHAT_SESSION_COOKIE_NAME,
  CHAT_STATEMENT,
  getChatSessionCookieOptions,
  parseChatCursor,
  parseChatLimit,
  parseChatSignInMessage,
  validateChatMessageBody
} from "./auth";

test("chat sign-in messages bind Arc Testnet and the current origin", () => {
  const walletAddress = getAddress("0x1111111111111111111111111111111111111111");
  const tokenAddress = getAddress("0x2222222222222222222222222222222222222222");
  const message = buildChatSignInMessage({
    address: walletAddress,
    domain: "librarc.app",
    expirationTime: "2026-08-03T12:10:00.000Z",
    issuedAt: "2026-08-03T12:00:00.000Z",
    nonce: "nonce",
    origin: "https://librarc.app",
    tokenAddress
  });
  const parsed = parseChatSignInMessage(message);

  assert.equal(parsed.chainId, ARC_TESTNET_CHAIN_ID);
  assert.equal(parsed.domain, "librarc.app");
  assert.equal(parsed.origin, "https://librarc.app");
  assert.equal(parsed.statement, CHAT_STATEMENT);
  assert.equal(parsed.address, walletAddress);
  assert.equal(parsed.tokenAddress, tokenAddress);
});

test("chat session cookies stay HttpOnly and site-scoped", () => {
  const cookie = getChatSessionCookieOptions(new Date("2026-08-03T12:00:00.000Z"));

  assert.equal(CHAT_SESSION_COOKIE_NAME, "librarc_chat_session");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
});

test("invalid cursor and limit values are rejected", () => {
  assert.throws(() => parseChatCursor("abc"));
  assert.throws(() => parseChatLimit("0"));
  assert.equal(parseChatLimit("30"), 30);
});

test("chat message validation trims text and rejects links or raw html", () => {
  assert.equal(validateChatMessageBody("  hello arc  "), "hello arc");
  assert.throws(() => validateChatMessageBody("https://example.com"));
  assert.throws(() => validateChatMessageBody("<b>hello</b>"));
});
