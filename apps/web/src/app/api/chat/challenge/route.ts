import { type NextRequest } from "next/server";

import { jsonNoStore } from "../../../../lib/arc/server-routes";
import { type ChatApiError, type ChatChallengeSuccess } from "../../../../lib/chat/chat-api";
import { getChatStore } from "../../../../lib/chat/store";
import { issueChatChallenge } from "../../../../lib/chat/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      chainId?: number;
      tokenAddress?: string;
      walletAddress?: string;
    };
    const challenge = await issueChatChallenge(
      {
        chainId: body.chainId ?? 0,
        domain: request.nextUrl.host,
        origin: request.nextUrl.origin,
        tokenAddress: body.tokenAddress,
        walletAddress: body.walletAddress ?? ""
      },
      getChatStore()
    );

    return jsonNoStore(200, {
      ok: true,
      walletAddress: challenge.walletAddress,
      tokenAddress: challenge.tokenAddress,
      chainId: challenge.chainId,
      nonce: challenge.nonce,
      message: challenge.message,
      issuedAt: challenge.issuedAt,
      expirationTime: challenge.expirationTime
    } satisfies ChatChallengeSuccess);
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
          label: "chat challenge",
          message: error instanceof Error ? error.message : "The chat challenge route failed."
        }
      ]
    } satisfies ChatApiError);
  }
}
