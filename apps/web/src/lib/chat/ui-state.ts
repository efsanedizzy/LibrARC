import { type TokenChatMessage } from "./chat-api";

export type ChatPanelMode =
  "authenticated" | "connect-wallet" | "sign-in" | "switch-network" | "unavailable";

export function getChatPanelMode({
  authenticated,
  available,
  isConnected,
  isWrongChain
}: {
  authenticated: boolean;
  available: boolean;
  isConnected: boolean;
  isWrongChain: boolean;
}) {
  if (!available) {
    return "unavailable" satisfies ChatPanelMode;
  }

  if (!isConnected) {
    return "connect-wallet" satisfies ChatPanelMode;
  }

  if (isWrongChain) {
    return "switch-network" satisfies ChatPanelMode;
  }

  if (!authenticated) {
    return "sign-in" satisfies ChatPanelMode;
  }

  return "authenticated" satisfies ChatPanelMode;
}

export function mergeTokenChatMessages(current: TokenChatMessage[], incoming: TokenChatMessage[]) {
  const merged = new Map<string, TokenChatMessage>();

  for (const message of [...current, ...incoming]) {
    merged.set(message.id, message);
  }

  return [...merged.values()].sort((left, right) => Number(BigInt(left.id) - BigInt(right.id)));
}
