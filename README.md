# LibrARC

Production-grade launchpad monorepo for the Arc blockchain.

## Workspace

- `apps/web`: Next.js 15 user application.
- `apps/admin`: Next.js 15 administration application.
- `services/api`: Rust Axum API service.
- `contracts`: Foundry smart contract workspace.
- `packages/ui`: Shared UI package.
- `packages/sdk`: Client SDK package.
- `packages/shared`: Shared TypeScript primitives.
- `packages/config`: Shared configuration package.

## Commands

- `pnpm dev`: Start workspace development tasks.
- `pnpm build`: Build all JavaScript and TypeScript workspaces.
- `pnpm lint`: Run ESLint across workspaces.
- `pnpm typecheck`: Run TypeScript checks.
- `pnpm format`: Format repository files.
- `cargo check`: Validate the Rust API from `services/api`.
- `forge build`: Build contracts from `contracts`.
