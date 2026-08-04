import { getAddress, isAddress, type Address } from "viem";

import { formatCompactAddress } from "./format";

export const TOKEN_ADDRESS_COPY_RESET_MS = 1_800;

export type TokenAddressCopyStatus = "idle" | "copied" | "error";

type ClipboardWriter = {
  writeText(text: string): Promise<void>;
};

type ClipboardNavigatorLike = {
  clipboard?: ClipboardWriter;
};

type ClipboardFocusableLike = {
  focus?: () => void;
};

type ClipboardTextareaLike = {
  readOnly?: boolean;
  setAttribute(name: string, value: string): void;
  select(): void;
  style: {
    left?: string;
    opacity?: string;
    position?: string;
    top?: string;
  };
  value: string;
};

type ClipboardDocumentLike = {
  activeElement?: ClipboardFocusableLike | null;
  body?: {
    appendChild(node: unknown): void;
    removeChild(node: unknown): void;
  };
  createElement(tagName: "textarea"): ClipboardTextareaLike;
  execCommand?(commandId: "copy"): boolean;
};

type TokenAddressCopyOptions = {
  address?: string | null;
  clearScheduledReset?: (handle: unknown) => void;
  currentResetHandle?: unknown;
  documentRef?: ClipboardDocumentLike;
  navigatorRef?: ClipboardNavigatorLike;
  onStatusChange: (status: TokenAddressCopyStatus) => void;
  resetDelayMs?: number;
  scheduleReset?: (callback: () => void, delayMs: number) => unknown;
};

type TokenAboutActionsInput = {
  contractCopyStatus: TokenAddressCopyStatus;
  creatorExplorerUrl?: string;
  discord?: string;
  poolExplorerUrl?: string;
  telegram?: string;
  tokenAddress?: string | null;
  tokenExplorerUrl?: string;
  website?: string;
  x?: string;
};

export type TokenAboutAction =
  | {
      href: string;
      kind: "link";
      key: string;
      label: string;
    }
  | {
      address: Address | null;
      ariaLabel: string;
      kind: "copy";
      key: "contract";
      label: string;
      liveMessage: string;
      title: string;
    };

export type TokenAddressCopyResult = {
  attempted: boolean;
  copiedAddress: Address | null;
  nextResetHandle: unknown;
  status: TokenAddressCopyStatus;
};

const DEFAULT_COPY_ERROR_MESSAGE = "Could not copy address";
const DEFAULT_COPY_ARIA_LABEL = "Copy token contract address";

function getNavigatorRef(navigatorRef?: ClipboardNavigatorLike) {
  if (navigatorRef) {
    return navigatorRef;
  }

  return typeof navigator === "undefined" ? undefined : (navigator as ClipboardNavigatorLike);
}

function getDocumentRef(documentRef?: ClipboardDocumentLike) {
  if (documentRef) {
    return documentRef;
  }

  return typeof document === "undefined" ? undefined : (document as ClipboardDocumentLike);
}

async function writeTextWithFallback({
  documentRef,
  navigatorRef,
  text
}: {
  documentRef?: ClipboardDocumentLike;
  navigatorRef?: ClipboardNavigatorLike;
  text: string;
}) {
  if (navigatorRef?.clipboard?.writeText) {
    await navigatorRef.clipboard.writeText(text);
    return;
  }

  if (!documentRef?.body || typeof documentRef.createElement !== "function") {
    throw new Error(DEFAULT_COPY_ERROR_MESSAGE);
  }

  const activeElement = documentRef.activeElement;
  const textarea = documentRef.createElement("textarea");

  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";

  documentRef.body.appendChild(textarea);

  try {
    textarea.select();

    if (!documentRef.execCommand || !documentRef.execCommand("copy")) {
      throw new Error(DEFAULT_COPY_ERROR_MESSAGE);
    }
  } finally {
    documentRef.body.removeChild(textarea);
    activeElement?.focus?.();
  }
}

export function normalizeTokenContractAddress(value?: string | null) {
  if (!value || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

export function getTokenAddressCopyPresentation(status: TokenAddressCopyStatus) {
  switch (status) {
    case "copied":
      return {
        buttonLabel: "Copied",
        liveMessage: "Contract address copied",
        pillLabel: "Copied"
      };
    case "error":
      return {
        buttonLabel: "Copy failed",
        liveMessage: DEFAULT_COPY_ERROR_MESSAGE,
        pillLabel: "Copy failed"
      };
    case "idle":
    default:
      return {
        buttonLabel: "Copy",
        liveMessage: "",
        pillLabel: "Contract"
      };
  }
}

export function getTokenAddressDisplay(address?: string | null) {
  const normalized = normalizeTokenContractAddress(address);

  if (!normalized) {
    return {
      canonicalAddress: null,
      compactAddress: "Not available",
      title: "Not available"
    };
  }

  return {
    canonicalAddress: normalized,
    compactAddress: formatCompactAddress(normalized),
    title: normalized
  };
}

export function buildTokenAboutActions({
  contractCopyStatus,
  creatorExplorerUrl,
  discord,
  poolExplorerUrl,
  telegram,
  tokenAddress,
  tokenExplorerUrl,
  website,
  x
}: TokenAboutActionsInput): TokenAboutAction[] {
  const actions: TokenAboutAction[] = [];
  const contractCopy = getTokenAddressCopyPresentation(contractCopyStatus);
  const contractAddress = normalizeTokenContractAddress(tokenAddress);

  if (website) {
    actions.push({ href: website, key: "website", kind: "link", label: "Website" });
  }

  if (x) {
    actions.push({ href: x, key: "x", kind: "link", label: "X" });
  }

  if (telegram) {
    actions.push({ href: telegram, key: "telegram", kind: "link", label: "Telegram" });
  }

  if (discord) {
    actions.push({ href: discord, key: "discord", kind: "link", label: "Discord" });
  }

  if (tokenExplorerUrl) {
    actions.push({ href: tokenExplorerUrl, key: "token", kind: "link", label: "Token" });
  }

  if (poolExplorerUrl) {
    actions.push({ href: poolExplorerUrl, key: "pool", kind: "link", label: "Pool" });
  }

  actions.push({
    address: contractAddress,
    ariaLabel: DEFAULT_COPY_ARIA_LABEL,
    key: "contract",
    kind: "copy",
    label: contractCopy.pillLabel,
    liveMessage: contractCopy.liveMessage,
    title: contractAddress ?? DEFAULT_COPY_ERROR_MESSAGE
  });

  if (creatorExplorerUrl) {
    actions.push({ href: creatorExplorerUrl, key: "creator", kind: "link", label: "Creator" });
  }

  return actions;
}

export async function copyTokenAddressWithFeedback({
  address,
  clearScheduledReset = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  currentResetHandle,
  documentRef,
  navigatorRef,
  onStatusChange,
  resetDelayMs = TOKEN_ADDRESS_COPY_RESET_MS,
  scheduleReset = setTimeout
}: TokenAddressCopyOptions): Promise<TokenAddressCopyResult> {
  const normalized = normalizeTokenContractAddress(address);

  if (!normalized) {
    return {
      attempted: false,
      copiedAddress: null,
      nextResetHandle: null,
      status: "idle"
    };
  }

  if (currentResetHandle) {
    clearScheduledReset(currentResetHandle);
  }

  try {
    await writeTextWithFallback({
      documentRef: getDocumentRef(documentRef),
      navigatorRef: getNavigatorRef(navigatorRef),
      text: normalized
    });

    onStatusChange("copied");

    return {
      attempted: true,
      copiedAddress: normalized,
      nextResetHandle: scheduleReset(() => onStatusChange("idle"), resetDelayMs),
      status: "copied"
    };
  } catch {
    onStatusChange("error");

    return {
      attempted: true,
      copiedAddress: normalized,
      nextResetHandle: scheduleReset(() => onStatusChange("idle"), resetDelayMs),
      status: "error"
    };
  }
}
