import { type NextRequest, NextResponse } from "next/server";

import { jsonNoStore } from "../../../../lib/arc/server-routes";
import { CHAT_SESSION_COOKIE_NAME } from "../../../../lib/chat/auth";
import { type ChatApiError, type ChatSessionSuccess } from "../../../../lib/chat/chat-api";
import { getChatStore } from "../../../../lib/chat/store";
import { createChatSession } from "../../../../lib/chat/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      message?: string;
      signature?: `0x${string}`;
    };
    const session = await createChatSession(
      {
        expectedDomain: request.nextUrl.host,
        expectedOrigin: request.nextUrl.origin,
        message: body.message ?? "",
        signature: body.signature ?? "0x"
      },
      getChatStore()
    );
    const response = NextResponse.json(
      {
        ok: true,
        walletAddress: session.walletAddress,
        tokenAddress: session.tokenAddress,
        expiresAt: session.expiresAt
      } satisfies ChatSessionSuccess,
      {
        headers: {
          "cache-control": "no-store, max-age=0"
        },
        status: 200
      }
    );

    response.cookies.set(CHAT_SESSION_COOKIE_NAME, session.cookie.value, session.cookie.options);

    return response;
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
          label: "chat session",
          message: error instanceof Error ? error.message : "The chat session route failed."
        }
      ]
    } satisfies ChatApiError);
  }
}
