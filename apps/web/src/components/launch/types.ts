import { type Address } from "viem";

export type LaunchFieldName =
  "description" | "initialPurchaseAmount" | "metadata" | "name" | "symbol";

export type LaunchFormValues = {
  description: string;
  initialPurchaseAmount: string;
  initialPurchaseEnabled: boolean;
  name: string;
  symbol: string;
};

export type LaunchFormErrors = Partial<Record<LaunchFieldName, string>>;

export type LaunchTechnicalDetail = {
  label: string;
  message: string;
};

export type LaunchFeedbackPhase =
  | "approval confirmed"
  | "approval required"
  | "approving"
  | "contract reverted"
  | "disconnected"
  | "idle"
  | "insufficient balance"
  | "loading configuration"
  | "partial success"
  | "quote unavailable"
  | "rpc unavailable"
  | "simulating"
  | "success"
  | "transaction pending"
  | "user rejected"
  | "validating"
  | "wallet confirmation"
  | "wrong chain";

export type LaunchFeedback = {
  details?: LaunchTechnicalDetail[];
  message: string;
  phase: LaunchFeedbackPhase;
  txHash?: `0x${string}`;
};

export type LaunchSuccessState = {
  creator: Address;
  factoryAddress: Address;
  initialPurchase?: {
    tokenAmountOut: string;
    usdcAmountIn: string;
  };
  launchId: string;
  poolAddress: Address;
  tokenAddress: Address;
  txHash: `0x${string}`;
};

export type LaunchPartialSuccessState = {
  details?: LaunchTechnicalDetail[];
  factoryAddress: Address;
  initialPurchaseAmount?: string;
  message: string;
  receiptStatus: "confirmed";
  txHash: `0x${string}`;
};
