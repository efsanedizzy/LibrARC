import { type NextRequest } from "next/server";
import { getAddress, type Address } from "viem";

import { librarcTokenAbi } from "../../../../../../lib/arc/abis";
import {
  ensureAddress,
  jsonNoStore,
  resolveCanonicalTradeContext,
  type ArcRouteFailure
} from "../../../../../../lib/arc/server-routes";
import { getArcTestnetServerPublicClient } from "../../../../../../lib/arc/server-client";
import {
  CHAT_SESSION_COOKIE_NAME,
  parseChatCursor,
  parseChatLimit
} from "../../../../../../lib/chat/auth";
import {
  type ChatApiError,
  type TokenChatPostSuccess,
  type TokenChatSuccess
} from "../../../../../../lib/chat/chat-api";
import { getChatStore } from "../../../../../../lib/chat/store";
import { createTokenChatMessage, listTokenChatMessages } from "../../../../../../lib/chat/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CHAT_BODY_BYTES = 8_192;

type RouteContext = {
  params: Promise<{
    address: string;
  }>;
};

function toChatFailure(error: ArcRouteFailure): {
  error: ChatApiError;
  status: number;
} {
  if (error.code === "TOKEN_NOT_REGISTERED") {
    return {
      error: {
        ok: false,
        code: "UNREGISTERED_TOKEN",
        message: error.message,
        details: error.details
      },
      status: error.status
    };
  }

  return {
    error: {
      ok: false,
      code: error.code === "RPC_UNAVAILABLE" ? "RPC_UNAVAILABLE" : "CONTRACT_READ_FAILED",
      message: error.message,
      details: error.details
    },
    status: error.status
  };
}

async function ensureRegisteredToken(address: string) {
  try {
    const tokenAddress = ensureAddress(address, "token");
    await resolveCanonicalTradeContext({
      tokenAddress
    });

    return tokenAddress;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "status" in error) {
      throw toChatFailure(error as ArcRouteFailure);
    }

    throw error;
  }
}

async function resolveHolderWallets(
  messages: Array<{ walletAddress: Address }>,
  tokenAddress: Address
) {
  const uniqueWallets = [
    ...new Set(messages.map((message) => message.walletAddress.toLowerCase()))
  ];

  if (uniqueWallets.length === 0) {
    return null;
  }

  try {
    const client = getArcTestnetServerPublicClient();
    const results = await client.multicall({
      allowFailure: true,
      contracts: uniqueWallets.map((walletAddress) => ({
        abi: librarcTokenAbi,
        address: tokenAddress,
        args: [getAddress(walletAddress)],
        functionName: "balanceOf"
      }))
    });
    const holderWallets = new Set<string>();

    results.forEach((result, index) => {
      if (result.status === "success" && typeof result.result === "bigint" && result.result > 0n) {
        holderWallets.add(uniqueWallets[index]);
      }
    });

    return holderWallets;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { address } = await context.params;
    const tokenAddress = await ensureRegisteredToken(address);
    const limit = parseChatLimit(request.nextUrl.searchParams.get("limit"));
    const cursor = parseChatCursor(request.nextUrl.searchParams.get("cursor"));
    const store = getChatStore();
    const sessionToken = request.cookies.get(CHAT_SESSION_COOKIE_NAME)?.value;
    const result = await listTokenChatMessages(
      {
        cursor,
        limit,
        sessionToken,
        tokenAddress
      },
      store
    );
    const holderWallets = await resolveHolderWallets(result.messages, tokenAddress);

    return jsonNoStore(200, {
      ok: true,
      messages: result.messages.map((message: (typeof result.messages)[number]) => ({
        ...message,
        isHolder: holderWallets ? holderWallets.has(message.walletAddress.toLowerCase()) : undefined
      })),
      nextCursor: result.nextCursor,
      totalCount: result.totalCount,
      viewer: result.viewer
    } satisfies TokenChatSuccess);
  } catch (error) {
    if (error && typeof error === "object" && "error" in error && "status" in error) {
      return jsonNoStore(error.status as number, error.error as ChatApiError);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "CHAT_UNAVAILABLE",
      message: "Token chat is temporarily unavailable.",
      details: [
        {
          label: "token chat",
          message: error instanceof Error ? error.message : "The token chat route failed."
        }
      ]
    } satisfies ChatApiError);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");

    if (Number.isFinite(contentLength) && contentLength > MAX_CHAT_BODY_BYTES) {
      return jsonNoStore(413, {
        ok: false,
        code: "CHAT_MESSAGE_INVALID",
        message: "The chat message request body is too large.",
        details: [
          {
            label: "content-length",
            message: "The chat message request body is too large."
          }
        ]
      } satisfies ChatApiError);
    }

    const { address } = await context.params;
    const tokenAddress = await ensureRegisteredToken(address);
    const body = (await request.json()) as {
      body?: string;
    };
    const sessionToken = request.cookies.get(CHAT_SESSION_COOKIE_NAME)?.value;
    const result = await createTokenChatMessage(
      {
        body: body.body,
        sessionToken,
        tokenAddress
      },
      getChatStore()
    );
    const holderWallets = await resolveHolderWallets([result.message], tokenAddress);

    return jsonNoStore(201, {
      ok: true,
      message: {
        ...result.message,
        isHolder: holderWallets
          ? holderWallets.has(result.message.walletAddress.toLowerCase())
          : undefined
      },
      viewer: result.viewer
    } satisfies TokenChatPostSuccess);
  } catch (error) {
    if (error && typeof error === "object" && "error" in error && "status" in error) {
      return jsonNoStore(error.status as number, error.error as ChatApiError);
    }

    return jsonNoStore(503, {
      ok: false,
      code: "CHAT_UNAVAILABLE",
      message: "Token chat is temporarily unavailable.",
      details: [
        {
          label: "token chat",
          message: error instanceof Error ? error.message : "The token chat route failed."
        }
      ]
    } satisfies ChatApiError);
  }
}
