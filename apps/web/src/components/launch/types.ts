import { type Address } from "viem";

export type LaunchFieldName = "description" | "metadata" | "name" | "symbol";

export type LaunchFormValues = {
  description: string;
  name: string;
  symbol: string;
};

export type LaunchFormErrors = Partial<Record<LaunchFieldName, string>>;

export type LaunchTechnicalDetail = {
  label: string;
  message: string;
};

export type LaunchFeedbackPhase =
  | "contract reverted"
  | "disconnected"
  | "idle"
  | "loading configuration"
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
  launchId: string;
  poolAddress: Address;
  tokenAddress: Address;
  txHash: `0x${string}`;
};
