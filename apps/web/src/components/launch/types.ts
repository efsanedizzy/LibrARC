export type LaunchFieldName =
  | "name"
  | "symbol"
  | "description"
  | "logo"
  | "website"
  | "twitter"
  | "telegram"
  | "initialPurchase"
  | "creatorWallet";

export type LaunchFormValues = {
  name: string;
  symbol: string;
  description: string;
  logoFile: File | null;
  logoPreviewUrl: string | null;
  website: string;
  twitter: string;
  telegram: string;
  initialPurchase: string;
  creatorWallet: string;
};

export type LaunchFormErrors = Partial<Record<LaunchFieldName, string>>;
