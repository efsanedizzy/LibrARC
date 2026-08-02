# LibrARC Web Deployment on Vercel

This guide prepares the existing pnpm/Turborepo monorepo for a Vercel deployment of `apps/web` only.

## Root Directory

Set the Vercel Project Root Directory to:

`apps/web`

Do not create a separate lockfile inside `apps/web`.
Vercel should detect the monorepo's root `pnpm-lock.yaml` and install from the workspace.

## Importing the Repository

1. Import the GitHub repository into Vercel.
2. Select the Next.js application under `apps/web`.
3. Confirm the Root Directory is `apps/web`.
4. Leave the framework as Next.js.
5. Do not add any private key, mnemonic, wallet password, or signing secret.

## Environment Variables

Apply the same values to Preview and Production unless you are intentionally testing an alternate non-secret RPC endpoint.

### Public variables

These are browser-safe and use the `NEXT_PUBLIC_` prefix:

- `NEXT_PUBLIC_ARC_TESTNET_RPC_URL`
- `NEXT_PUBLIC_ARC_TESTNET_EXPLORER_URL`
- `NEXT_PUBLIC_ARC_FACTORY_ADDRESS`
- `NEXT_PUBLIC_ARC_FEE_VAULT_ADDRESS`
- `NEXT_PUBLIC_ARC_USDC_ADDRESS`
- `NEXT_PUBLIC_ARC_STAGING_ADAPTER_ADDRESS`
- `NEXT_PUBLIC_ARC_EXAMPLE_TOKEN_ADDRESS`
- `NEXT_PUBLIC_ARC_EXAMPLE_POOL_ADDRESS`

Verified Arc Testnet values currently documented in `apps/web/.env.example`:

- Explorer: `https://testnet.arcscan.app`
- Factory: `0xc94503F5DcDc43B0a4693C689a7520ccfd2bA0fA`
- FeeVault: `0x084b9a1a9ad2c46b9d200012dae39b83d5c24b05`
- Arc USDC: `0x3600000000000000000000000000000000000000`
- Staging adapter: `0x8f71AB54e51101C2fd04C656572782B2410577d5`

### Server-only variables

These must not use `NEXT_PUBLIC_`:

- `ARC_TESTNET_RPC_URL`
- `ARC_TESTNET_RPC_FALLBACK_URL_1`
- `ARC_TESTNET_RPC_FALLBACK_URL_2`
- `ARC_TESTNET_RPC_FALLBACK_URL_3`

These values are used only by server-side Arc API routes. They must never contain private keys or wallet credentials.

## Build Expectations

- Install command: Vercel's default pnpm workspace install is sufficient.
- Build command: Vercel can use the `apps/web` package default, which runs `next build`.
- Output setting: the app already uses Next.js output tracing with `output: "standalone"` and a monorepo-safe tracing root.

The current web build does not require live blockchain reads during module import, page compilation, or static generation. Arc RPC access happens at request time through API routes.

## Verification After Deploy

Check these routes after a successful Preview or Production deployment:

- `/`
- `/launch`
- `/profile`
- `/token/0x1385964841Fb1Cd3a1f4f553615320D375125290`
- `/api/arc/health`
- `/api/arc/launch/config`
- `/api/arc/launches`

Expected outcomes:

- Internal application links stay relative, such as `/launch`, `/profile`, and `/token/<address>`.
- Explorer links point to `https://testnet.arcscan.app`.
- Arc API routes return structured JSON errors when RPC access is unavailable.
- No server-side wallet, signer, or transaction submission is used.

## Rollback

1. Open the Vercel project.
2. Select the previous known-good deployment.
3. Promote or redeploy that version.
4. Re-check `/api/arc/health`, `/api/arc/launches`, and a token page before reopening traffic expectations.

## Security Notes

- Never place a private key, mnemonic, keystore, or wallet password in Vercel.
- Do not add custodial signing, relays, or server wallet clients for this application.
- All transaction signing must remain inside the connected browser wallet.
