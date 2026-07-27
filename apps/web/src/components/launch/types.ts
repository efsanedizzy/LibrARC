export type LaunchStep = 1 | 2 | 3 | 4;

export type LaunchFieldName =
  | "name"
  | "symbol"
  | "description"
  | "logo"
  | "website"
  | "twitter"
  | "telegram"
  | "initialPurchase";

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
};

export type LaunchFormErrors = Partial<Record<LaunchFieldName, string>>;

export const launchSteps: Array<{
  description: string;
  id: LaunchStep;
  title: string;
}> = [
  {
    id: 1,
    title: "Token Details",
    description: "Define the token identity and narrative."
  },
  {
    id: 2,
    title: "Media and Social Links",
    description: "Add a logo and optional project links."
  },
  {
    id: 3,
    title: "Initial Purchase",
    description: "Set an optional creator purchase amount."
  },
  {
    id: 4,
    title: "Review and Launch",
    description: "Confirm everything before launch is enabled."
  }
];

export const stepFields: Record<LaunchStep, LaunchFieldName[]> = {
  1: ["name", "symbol", "description"],
  2: ["logo", "website", "twitter", "telegram"],
  3: ["initialPurchase"],
  4: ["name", "symbol", "description", "logo", "website", "twitter", "telegram", "initialPurchase"]
};
