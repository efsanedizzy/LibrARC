import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

const nextConfigs = compat.extends("next/core-web-vitals", "next/typescript").map((config) => ({
  ...config,
  files: ["apps/web/**/*.{js,jsx,ts,tsx}", "apps/admin/**/*.{js,jsx,ts,tsx}"]
}));

export default [
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/node_modules/**",
      "services/api/target/**",
      "contracts/cache/**",
      "contracts/out/**",
      "contracts/lib/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextConfigs,
  {
    files: ["apps/*/next-env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off"
    }
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error"
    }
  }
];
