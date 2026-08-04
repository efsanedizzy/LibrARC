import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ARC_TESTNET_CHAIN_ID } from "../arc/config";
import {
  createChatSession,
  createTokenChatMessage,
  getChatViewer,
  issueChatChallenge,
  listTokenChatMessages
} from "./service";
import {
  type ChatStore,
  type StoredChatMessage,
  type StoredChatNonce,
  type StoredChatSession
} from "./store";

class MockChatStore implements ChatStore {
  messages: StoredChatMessage[] = [];
  nonces: StoredChatNonce[] = [];
  sessions: StoredChatSession[] = [];
  nextNonceId = 1;
  nextSessionId = 1;
  nextMessageId = 1n;
  now = new Date("2026-08-03T12:00:00.000Z");

  async countMessagesSince({ since, walletAddress }: { since: Date; walletAddress: string }) {
    return this.messages.filter(
      (message) =>
        message.walletAddress === walletAddress && message.createdAt.getTime() >= since.getTime()
    ).length;
  }

  async createMessage(args: { body: string; tokenAddress: string; walletAddress: string }) {
    const message = {
      body: args.body,
      createdAt: this.now,
      id: this.nextMessageId,
      tokenAddress: args.tokenAddress,
      walletAddress: args.walletAddress
    } satisfies StoredChatMessage;

    this.nextMessageId += 1n;
    this.messages.push(message);

    return message;
  }

  async createNonce(args: {
    chainId: number;
    expiresAt: Date;
    nonceHash: string;
    tokenAddress?: string;
    walletAddress: string;
  }) {
    this.nonces.push({
      chainId: args.chainId,
      expiresAt: args.expiresAt,
      id: String(this.nextNonceId++),
      issuedAt: new Date(),
      nonceHash: args.nonceHash,
      tokenAddress: args.tokenAddress,
      usedAt: null,
      walletAddress: args.walletAddress
    });
  }

  async createSession(args: { expiresAt: Date; sessionTokenHash: string; walletAddress: string }) {
    this.sessions.push({
      createdAt: new Date(),
      expiresAt: args.expiresAt,
      id: String(this.nextSessionId++),
      revokedAt: null,
      sessionTokenHash: args.sessionTokenHash,
      walletAddress: args.walletAddress
    });
  }

  async getLatestMessageByWallet(walletAddress: string) {
    return (
      [...this.messages]
        .filter((message) => message.walletAddress === walletAddress)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
    );
  }

  async getSessionByHash(sessionTokenHash: string) {
    return this.sessions.find((session) => session.sessionTokenHash === sessionTokenHash) ?? null;
  }

  async listMessages(args: { cursor?: bigint | null; limit: number; tokenAddress: string }) {
    const filtered = this.messages
      .filter(
        (message) =>
          message.tokenAddress === args.tokenAddress &&
          (args.cursor === null || args.cursor === undefined || message.id < args.cursor)
      )
      .sort((left, right) => Number(right.id - left.id));
    const visible = filtered.slice(0, args.limit);

    return {
      hasMore: filtered.length > args.limit,
      messages: [...visible].reverse(),
      totalCount: this.messages.filter((message) => message.tokenAddress === args.tokenAddress)
        .length
    };
  }

  async useNonce(args: { chainId: number; nonceHash: string; walletAddress: string }) {
    const match = this.nonces.find(
      (nonce) =>
        nonce.chainId === args.chainId &&
        nonce.nonceHash === args.nonceHash &&
        nonce.usedAt === null &&
        nonce.walletAddress === args.walletAddress &&
        nonce.expiresAt.getTime() > this.now.getTime()
    );

    if (!match) {
      return null;
    }

    match.usedAt = new Date();

    return match;
  }
}

const scopedTokenAddress = getAddress("0x2222222222222222222222222222222222222222");

const account = privateKeyToAccount(
  "0x59c6995e998f97a5a0044976f5d5bb6d4bbf50f4a0a18dd2c2b31f0c7f6dba3f"
);

async function createAuthenticatedSession(store: MockChatStore) {
  store.now = new Date("2026-08-03T12:00:00.000Z");
  const challenge = await issueChatChallenge(
    {
      chainId: ARC_TESTNET_CHAIN_ID,
      domain: "librarc.app",
      origin: "https://librarc.app",
      tokenAddress: scopedTokenAddress,
      walletAddress: account.address
    },
    store,
    new Date("2026-08-03T12:00:00.000Z")
  );
  const signature = await account.signMessage({
    message: challenge.message
  });

  store.now = new Date("2026-08-03T12:01:00.000Z");
  return createChatSession(
    {
      expectedDomain: "librarc.app",
      expectedOrigin: "https://librarc.app",
      message: challenge.message,
      signature
    },
    store,
    new Date("2026-08-03T12:01:00.000Z")
  );
}

test("nonce use is one-time and sessions create no on-chain transaction path", async () => {
  const store = new MockChatStore();
  const challenge = await issueChatChallenge(
    {
      chainId: ARC_TESTNET_CHAIN_ID,
      domain: "librarc.app",
      origin: "https://librarc.app",
      walletAddress: account.address
    },
    store,
    new Date("2026-08-03T12:00:00.000Z")
  );
  store.now = new Date("2026-08-03T12:01:00.000Z");
  const signature = await account.signMessage({
    message: challenge.message
  });
  const session = await createChatSession(
    {
      expectedDomain: "librarc.app",
      expectedOrigin: "https://librarc.app",
      message: challenge.message,
      signature
    },
    store,
    new Date("2026-08-03T12:01:00.000Z")
  );

  assert.equal(session.walletAddress, account.address);
  assert.equal(typeof session.cookie.value, "string");
  await assert.rejects(
    () =>
      createChatSession(
        {
          expectedDomain: "librarc.app",
          expectedOrigin: "https://librarc.app",
          message: challenge.message,
          signature
        },
        store,
        new Date("2026-08-03T12:02:00.000Z")
      ),
    (error: unknown) =>
      Boolean(error && typeof error === "object" && "status" in error && error.status === 401)
  );
});

test("wrong origin or wrong signer is rejected", async () => {
  const store = new MockChatStore();
  const challenge = await issueChatChallenge(
    {
      chainId: ARC_TESTNET_CHAIN_ID,
      domain: "librarc.app",
      origin: "https://librarc.app",
      walletAddress: account.address
    },
    store,
    new Date("2026-08-03T12:00:00.000Z")
  );
  store.now = new Date("2026-08-03T12:01:00.000Z");
  const signature = await account.signMessage({
    message: challenge.message
  });
  const wrongSigner = privateKeyToAccount(
    "0x8b3a350cf5c34c9194ca7e9ff0b4d3d858f1d1ca4f9455f5e3c4d8cdd6f7fe35"
  );
  const wrongSignature = await wrongSigner.signMessage({
    message: challenge.message
  });

  await assert.rejects(() =>
    createChatSession(
      {
        expectedDomain: "librarc.app",
        expectedOrigin: "https://wrong.example",
        message: challenge.message,
        signature
      },
      store,
      new Date("2026-08-03T12:01:00.000Z")
    )
  );

  await assert.rejects(() =>
    createChatSession(
      {
        expectedDomain: "librarc.app",
        expectedOrigin: "https://librarc.app",
        message: challenge.message,
        signature: wrongSignature
      },
      store,
      new Date("2026-08-03T12:01:00.000Z")
    )
  );
});

test("valid token messages persist, paginate, and deduplicate by stable ids", async () => {
  const store = new MockChatStore();
  const session = await createAuthenticatedSession(store);

  store.now = new Date("2026-08-03T12:05:00.000Z");
  const first = await createTokenChatMessage(
    {
      body: "First message",
      sessionToken: session.cookie.value,
      tokenAddress: scopedTokenAddress
    },
    store,
    {
      now: new Date("2026-08-03T12:05:00.000Z")
    }
  );
  store.now = new Date("2026-08-03T12:05:04.000Z");
  const second = await createTokenChatMessage(
    {
      body: "Second message",
      sessionToken: session.cookie.value,
      tokenAddress: scopedTokenAddress
    },
    store,
    {
      now: new Date("2026-08-03T12:05:04.000Z")
    }
  );
  const listed = await listTokenChatMessages(
    {
      limit: 1,
      sessionToken: session.cookie.value,
      tokenAddress: scopedTokenAddress
    },
    store
  );

  assert.equal(first.message.body, "First message");
  assert.equal(second.message.body, "Second message");
  assert.equal(listed.messages.length, 1);
  assert.equal(listed.nextCursor, second.message.id);
  assert.equal(listed.viewer.authenticated, true);
});

test("unauthenticated, oversized, linked, and rate-limited messages are rejected", async () => {
  const store = new MockChatStore();
  const session = await createAuthenticatedSession(store);

  await assert.rejects(() =>
    createTokenChatMessage(
      {
        body: "Hello",
        tokenAddress: scopedTokenAddress
      },
      store
    )
  );
  await assert.rejects(() =>
    createTokenChatMessage(
      {
        body: "x".repeat(501),
        sessionToken: session.cookie.value,
        tokenAddress: scopedTokenAddress
      },
      store,
      {
        now: new Date("2026-08-03T12:10:00.000Z")
      }
    )
  );
  await assert.rejects(() =>
    createTokenChatMessage(
      {
        body: "visit https://example.com",
        sessionToken: session.cookie.value,
        tokenAddress: scopedTokenAddress
      },
      store,
      {
        now: new Date("2026-08-03T12:10:00.000Z")
      }
    )
  );

  store.now = new Date("2026-08-03T12:11:00.000Z");
  await createTokenChatMessage(
    {
      body: "First",
      sessionToken: session.cookie.value,
      tokenAddress: scopedTokenAddress
    },
    store,
    {
      now: new Date("2026-08-03T12:11:00.000Z")
    }
  );

  await assert.rejects(() =>
    createTokenChatMessage(
      {
        body: "Too fast",
        sessionToken: session.cookie.value,
        tokenAddress: scopedTokenAddress
      },
      store,
      {
        now: new Date("2026-08-03T12:11:02.000Z")
      }
    )
  );
});

test("expired viewer sessions resolve to signed-out chat state", async () => {
  const store = new MockChatStore();
  const session = await createAuthenticatedSession(store);
  const viewer = await getChatViewer(
    session.cookie.value,
    store,
    new Date("2026-08-04T12:05:00.000Z")
  );

  assert.equal(viewer.authenticated, false);
});
