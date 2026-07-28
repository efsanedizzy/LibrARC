# LibrARC Launch Protocol Specification

Status: Draft MVP specification
Date: July 28, 2026
Network: Arc Testnet
Chain ID: `5042002`

## 1. Purpose

This document defines the official MVP launch protocol for LibrARC before any Solidity implementation begins.

The protocol goal is to support permissionless creation and early trading of Pump.fun-style ERC-20 launches on Arc Testnet using a dedicated Arc USDC-quoted bonding-curve pool, followed by a one-time graduation flow into external liquidity through an adapter interface.

This specification is intended to:

- define the minimum required contract architecture
- fix the core token, launch, trading, fee, accounting, and graduation rules
- identify security and economic invariants
- clearly separate resolved decisions from unresolved protocol parameters
- remove architectural contradictions before Solidity work starts
- prevent frontend behavior, metadata, or off-chain assumptions from implicitly defining protocol logic

## 2. Scope

This specification covers the MVP on-chain launch protocol only.

Included:

- token creation and deployment flow
- launch pool lifecycle
- creator initial purchase behavior
- Arc USDC-based buys and sells
- bonding-curve accounting model
- graduation trigger and migration interface
- fee accounting model
- pause and role controls
- event and custom-error requirements
- testing and audit readiness requirements

Excluded:

- Solidity implementation details
- frontend implementation
- backend indexing
- metadata hosting
- production operations runbooks
- DEX-specific migration logic
- mainnet deployment execution

## 3. Terminology

- `Arc USDC`: the ERC-20 quote asset used by the protocol at `0x3600000000000000000000000000000000000000`
- `USDC units`: 6-decimal ERC-20 accounting units used for all quote-asset trading and protocol accounting
- `Native gas-token representation`: 18-decimal representation used by the chain for gas-token semantics outside this protocol
- `Launch`: a single token-creation event plus its associated launch pool
- `Launch pool`: the dedicated trading contract for one token
- `Bonding curve`: the pricing function used by the launch pool
- `Virtual reserves`: synthetic reserve parameters used to shape pricing on a constant-product curve
- `Real reserves`: internal accounted reserves that determine graduation eligibility and represent user-backed curve assets
- `Accrued protocol fees`: internal accounted fees owned by the protocol and excluded from user-backed curve reserves
- `Graduation`: the one-time transition that permanently disables curve trading and migrates liquidity through an adapter
- `GraduationPending`: the intermediate terminal-trading-disabled state entered once the graduation threshold is reached but before migration succeeds
- `Creator`: the address that requests token creation
- `Trader`: any address buying or selling through the launch pool
- `Fee vault`: the destination contract for protocol-owned fees
- `Adapter`: the liquidity-migration integration point exposed through `ILiquidityAdapter`

Important decimal rule:

- all trading and accounting inside the launch protocol must use Arc USDC as an ERC-20 with 6 decimals
- native 18-decimal USDC-like representations must never be mixed with protocol USDC accounting
- all quote accounting is done in USDC ERC-20 6-decimal units
- all launch-token accounting is done in launch-token 18-decimal units

## 4. Actors

- `Creator`
  - creates a launch
  - may optionally perform an initial purchase
  - has no special pricing privilege
  - has no special fee treatment
  - has no post-launch administrative control over token transfers
  - never receives protocol roles by virtue of being creator
- `Trader`
  - buys and sells through a launch pool subject to curve pricing, slippage checks, deadlines, fees, and pause conditions
- `Pause role`
  - controls launch-creation pause and trading pauses
- `Fee-management role`
  - updates unresolved fee parameters within bounded limits once those limits are finalized
- `Graduation role`
  - manages approved adapter configuration and related graduation administration
  - is not required to call `graduate()`
  - must not be able to block an eligible graduation
- `Treasury authority`
  - receives protocol-owned fees indirectly through the configured `FeeVault`
- `Multisig`
  - required production holder for privileged operational roles
- `Timelock`
  - required future production protection for sensitive configuration changes
- `Liquidity adapter`
  - receives assets during graduation and executes migration to an external liquidity venue or a mock or disabled target

## 5. Contract Architecture

The MVP architecture consists of exactly these contracts and interfaces:

- `LibrARCToken`
- `LaunchFactory`
- `LaunchPool`
- `FeeVault`
- `ILiquidityAdapter`

No additional micro-contracts should be introduced unless a future design review identifies a clear security, operational, or auditability reason.

### 5.1 LibrARCToken

Responsibilities:

- standard ERC-20 token
- fixed total supply
- 18 token decimals
- default total supply: `1,000,000,000` tokens
- token metadata reference stored separately from token behavior

Resolved token constraints:

- no free creator allocation
- no post-deployment minting
- no burn authority
- no freeze authority
- no blacklist
- no transfer tax
- no configurable transfer hooks
- no creator ownership or administrative control over token transfers
- no hidden owner minting or balance modification

Deployment rule:

- `LibrARCToken` mints the full fixed supply to `LaunchFactory`, not directly to `LaunchPool`

### 5.2 LaunchFactory

Responsibilities:

- permissionless token creation
- deployment or orchestration of `LibrARCToken` and `LaunchPool`
- canonical registry of created launches
- validation of protocol-wide configuration
- optional creator initial purchase flow at creation time
- pausable launch-creation entrypoints

Deployment ordering requirements:

1. `LaunchFactory` deploys `LibrARCToken`.
2. The full fixed token supply is minted to `LaunchFactory`.
3. `LaunchFactory` deploys `LaunchPool`.
4. `LaunchFactory` transfers the entire launch-token supply to `LaunchPool` in the same transaction.
5. `LaunchFactory` must have zero balance of that launch token at the end of successful creation.
6. If any creation step fails, the entire transaction reverts.
7. No delayed or later token transfer from factory to pool is permitted.

Atomic creator initial purchase responsibilities:

- accept `amountIn`, `minTokenOut`, `deadline`, and `recipient`
- require the creator to approve `LaunchFactory` for Arc USDC beforehand
- pull approved USDC using `SafeERC20`
- create token and pool
- transfer full token supply into the pool
- execute the creator purchase through the same internal pricing path used by public buys
- revert the entire launch creation if the creator purchase fails

Constraints:

- non-upgradeable for MVP
- must not rely on `tx.origin`
- must not perform arbitrary `delegatecall`
- must not expose user-controlled external calls except tightly scoped protocol dependencies
- must end successful creation with zero balance of the launch token

### 5.3 LaunchPool

Responsibilities:

- hold launch token inventory
- hold Arc USDC reserves
- execute buys and sells while state is `Active`
- enforce slippage and deadline protection
- maintain internal real and virtual reserve state
- collect protocol fees according to pool configuration
- enforce graduation state transitions

Required internal accounting variables:

- `realUsdcReserve`
- `realTokenReserve`
- `virtualUsdcReserve`
- `virtualTokenReserve`
- `accruedProtocolFees`

Resolved state machine:

- `Active`
- `GraduationPending`
- `Graduated`

State constraints:

- buys and sells are enabled only in `Active`
- reaching the threshold moves the pool to `GraduationPending`
- buys and sells stop permanently when `GraduationPending` begins
- `graduate()` is permissionless and retryable while `GraduationPending`
- `Graduated` is assigned only after successful migration
- a `Graduated` pool can never return to any earlier state
- graduation cannot execute twice

Trading constraints:

- state-changing trading functions must use `ReentrancyGuard`
- Arc USDC transfers must use `SafeERC20`
- checks-effects-interactions ordering is required
- zero-value trades must revert
- zero-output trades must revert
- trading after `Active` must revert

### 5.4 FeeVault

Responsibilities:

- receive protocol-owned launch fees if enabled
- receive protocol-owned trading fees if enabled
- provide auditable separation between user-backed pool reserves and protocol-owned fees
- allow withdrawals only to an explicitly configured treasury

Constraints:

- must not be a backdoor for withdrawing user-backed curve reserves
- fee withdrawals must be explicitly scoped to protocol-owned funds only
- treasury changes must be timelocked in production

### 5.5 ILiquidityAdapter

Responsibilities:

- standardize liquidity migration during graduation
- abstract away DEX-specific integration details
- define the migration boundary for launch-pool assets after curve trading ends

Constraints:

- the protocol must not assume any specific DEX exists
- the adapter may not make arbitrary calls supplied by users
- allowances must be minimal and cleared when practical
- every pool records its adapter at launch
- pool adapter configuration cannot change after the pool enters `GraduationPending`
- adapter configuration changes for future pools must not affect pools already in `GraduationPending`
- a disabled adapter is testnet-only and must not be usable in production

## 6. Token Lifecycle

1. Creator calls `LaunchFactory` with launch parameters, metadata reference, and optional initial-purchase parameters.
2. `LaunchFactory` deploys `LibrARCToken`.
3. `LibrARCToken` mints the full fixed supply to `LaunchFactory`.
4. `LaunchFactory` deploys `LaunchPool`.
5. `LaunchFactory` transfers the entire launch-token supply to `LaunchPool` in the same transaction.
6. `LaunchFactory` finishes successful creation with zero balance of the launch token.
7. If configured, the optional creator initial purchase executes atomically as part of the same launch transaction.
8. Token becomes tradable only through the pool's lifecycle rules.
9. No additional supply may ever be minted.
10. No authority may freeze, confiscate, or alter balances through administrative controls.
11. After graduation, token trading through the curve remains permanently disabled, but the token itself remains a normal ERC-20.

## 7. Launch Lifecycle

1. Creator submits launch request.
2. Factory validates metadata references, protocol configuration, and optional creator-purchase parameters.
3. If an initial purchase is requested, creator must provide:
   - `amountIn`
   - `minTokenOut`
   - `deadline`
   - non-zero `recipient`
4. Creator approves `LaunchFactory` to spend Arc USDC.
5. `LaunchFactory` pulls approved Arc USDC with `SafeERC20`.
6. `LaunchFactory` deploys the token and pool.
7. `LaunchFactory` transfers the entire token supply to the pool in the same transaction.
8. `LaunchFactory` executes the creator purchase through the same internal pricing path used by public buys.
9. The creator purchase uses the same fee rules as any public buy.
10. The creator purchase emits the same trade event schema as a normal buy.
11. The creator purchase amount counts toward:
    - `realUsdcReserve`
    - graduation eligibility
    exactly like a public buy.
12. If any creation or creator-purchase step fails, the entire launch transaction reverts.
13. Successful creation leaves the pool in `Active`.

## 8. Trading Lifecycle

### 8.1 Buy

1. Trader specifies USDC input, minimum token output, and deadline.
2. Pool validates:
   - pool state is `Active`
   - buy path is not paused
   - deadline not expired
   - input is non-zero
3. Pool computes gross token output using the curve and internal accounting variables.
4. Pool applies fee logic if enabled.
5. Pool verifies resulting token output is non-zero and satisfies slippage protection.
6. Pool updates internal accounting.
7. Pool pulls Arc USDC with `SafeERC20`.
8. Pool transfers launch tokens to the trader.
9. Pool emits buy and reserve-update events.
10. Pool checks graduation eligibility using `realUsdcReserve` excluding `accruedProtocolFees`.
11. If the threshold is reached, pool transitions from `Active` to `GraduationPending`.

### 8.2 Sell

1. Trader specifies token input, minimum USDC output, and deadline.
2. Pool validates:
   - pool state is `Active`
   - global trading is not paused
   - deadline not expired
   - input is non-zero
3. Pool computes gross USDC output using the curve and internal accounting variables.
4. Pool applies fee logic if enabled.
5. Pool verifies resulting USDC output is non-zero and satisfies slippage protection.
6. Pool updates internal accounting.
7. Pool transfers tokens in.
8. Pool transfers Arc USDC out with `SafeERC20`.
9. Pool emits sell and reserve-update events.

### 8.3 Non-active states

- buys must revert outside `Active`
- sells must revert outside `Active`
- no further curve reserve changes may occur after `GraduationPending` begins except graduation-finalization accounting

## 9. Bonding Curve Model

The MVP uses a virtual-reserve constant-product bonding curve.

Conceptually:

- price discovery is based on internal reserve state, not raw `balanceOf` reads
- virtual reserves shape the starting price and curve depth
- actual Arc USDC balances and actual launch-token balances remain distinct from virtual reserve parameters

Required model properties:

- buy and sell pricing must derive from the same coherent internal curve state
- fee application must be explicit and deterministic
- slippage bounds must be enforced on-chain
- direct token or USDC donations must not change pricing
- direct token or USDC donations must not change graduation eligibility
- trade outputs must never be silently rounded to zero

Rounding requirements:

- buy outputs round down
- sell outputs round down
- required input calculations round up where applicable
- zero-output trades revert

Unresolved protocol parameters:

- exact constant-product equations
- normalization between 6-decimal USDC and 18-decimal tokens
- exact rounding implementation details inside the future `BondingCurve` logic
- virtual token reserve value
- virtual USDC reserve value
- minimum trade amount

This document intentionally does not finalize those numerical or formula-specific values.

## 10. Reserve Accounting

Reserve accounting must use explicit internal variables:

- `realUsdcReserve`
- `realTokenReserve`
- `virtualUsdcReserve`
- `virtualTokenReserve`
- `accruedProtocolFees`

Rules:

- all quote-asset accounting uses Arc USDC ERC-20 6-decimal units
- all launch-token accounting uses launch-token 18-decimal units
- native 18-decimal gas-token representations must never be mixed into pool accounting
- pricing must use internal accounting variables, not raw token `balanceOf` values
- graduation threshold uses `realUsdcReserve` excluding `accruedProtocolFees`
- protocol-owned fees must be separable from user-backed curve reserves
- reserve accounting must be independently testable from UI assumptions
- completed trades must not be retroactively repriced by later fee changes

Donation handling:

- accidental direct Arc USDC donations must not alter pricing or graduation eligibility
- accidental direct launch-token donations must not alter pricing or graduation eligibility
- in MVP, accidental direct donations should be treated as unrecoverable unless a narrowly scoped excess-token recovery rule is later added
- any future excess-token recovery rule must prove that recovered assets are not part of accounted reserves
- no rescue function may withdraw accounted Arc USDC reserves
- no rescue function may withdraw accounted launch-token reserves from an active pool

The contracts must explicitly document where each of the following ends up during graduation:

- user-backed Arc USDC reserves
- unused launch tokens
- accrued protocol fees

Those destinations must be deterministic, auditable, and not discretionary.

## 11. Graduation Lifecycle

Graduation occurs when a configurable Arc USDC reserve threshold is reached.

Resolved rules:

- threshold exists
- threshold is configurable
- graduation becomes permissionless once the threshold is reached
- no creator, administrator, or graduation role may block an eligible graduation
- liquidity migration must route through `ILiquidityAdapter`
- graduation is one-time only
- graduation must not be repeatable

Unresolved rule:

- exact Arc USDC reserve threshold

State machine:

- `Active -> GraduationPending -> Graduated`

Transition rules:

- only `Active` allows buys and sells
- reaching the threshold moves the pool to `GraduationPending`
- buys and sells permanently stop when `GraduationPending` begins
- `graduate()` is permissionless and retryable while `GraduationPending`
- adapter failure leaves the pool in `GraduationPending`
- assets remain in the pool after a failed adapter call
- adapter failure must not partially transfer assets
- `Graduated` is assigned only after successful migration
- a `Graduated` pool can never return to any earlier state
- graduation cannot execute twice

Role constraints:

- the graduation role may manage approved adapter configuration
- the graduation role must not be required to call `graduate()`
- adapter changes must not affect pools that have already entered `GraduationPending`

## 12. Fee Model

Fee categories:

- launch fee
- trading fee

Rules:

- unresolved fee values must not be hardcoded in this specification
- percentage-based fees must use basis points
- a hard maximum fee must exist in contracts
- the exact hard maximum fee value remains unresolved in this document
- values above the eventual hard maximum must revert
- fee changes apply prospectively only
- fee changes must not retroactively alter completed trades
- creator initial purchases use the same fee rules as public buys
- fees are excluded from `realUsdcReserve`
- fees are added to `accruedProtocolFees`
- movement of protocol-owned fees to `FeeVault` must not affect curve reserve accounting
- graduation migrates user-backed reserves, not protocol-owned fees
- future production fee changes must be controlled by multisig plus timelock

The specification does not finalize:

- launch fee value
- buy fee value
- sell fee value
- hard maximum fee value

## 13. Access-Control Matrix

| Capability | Public | Creator | Pause Role | Fee Role | Graduation Role | Admin / Treasury Authority | Production Control |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create launch | Yes | Yes | No | No | No | No | Public |
| Creator initial purchase | Yes via launch creation | Yes | No | No | No | No | Public |
| Buy from pool | Yes when `Active` and not buy-paused | No privilege | No | No | No | No | Public |
| Sell to pool | Yes when `Active` and not fully paused | No privilege | No | No | No | No | Public |
| Call `graduate()` when eligible | Yes | No privilege | No | No | Not required | No | Public |
| pauseLaunchCreation | No | No | Yes | No | No | No | Multisig |
| unpauseLaunchCreation | No | No | Yes | No | No | No | Multisig |
| pauseBuys | No | No | Yes | No | No | No | Multisig |
| pauseAllTrading | No | No | Yes | No | No | No | Multisig |
| Unpause active pool trading | No | No | Yes | No | No | No | Multisig |
| Update fee parameters | No | No | No | Yes | No | No | Multisig plus timelock |
| Manage approved adapters for future launches | No | No | No | No | Yes | No | Multisig plus timelock |
| Configure treasury destination | No | No | No | No | No | Yes | Multisig plus timelock |
| Withdraw from FeeVault to treasury | No | No | No | No | No | Yes | Multisig |

Notes:

- no creator receives protocol roles
- use a safer delayed or two-step default-admin model
- no permanent `DEFAULT_ADMIN_ROLE` should remain on a normal EOA in production
- production admin, pause, fee, adapter, and treasury authority must be multisig controlled
- sensitive changes must be timelocked in production
- pausing is operational control, not confiscation authority

## 14. Emergency Controls

MVP requires separate controls:

- `pauseLaunchCreation`
- `pauseBuys`
- `pauseAllTrading`

Behavioral rules:

- `pauseLaunchCreation` stops new launches but does not affect existing reserve balances
- `pauseBuys` stops buys but does not authorize confiscation, rewriting, or reserve withdrawal
- `pauseAllTrading` stops both buys and sells but does not authorize confiscation, rewriting, or reserve withdrawal
- pause never transfers, confiscates, rewrites, or authorizes withdrawal of user assets
- unpause is allowed only while the pool is still `Active`
- `GraduationPending` and `Graduated` can never be unpaused back into trading
- no rescue function may withdraw accounted Arc USDC or launch-token reserves from an active pool

Recovery limitations:

- paused systems may require governance action to resume
- post-graduation trading must never be resumed
- immutable contracts limit hotfix options; deployment replacement may be required for non-pausable bugs
- pausing is distinct from confiscating funds and must never be treated as an asset-seizure mechanism

## 15. Events

Every important state transition must emit an explicit event.

Minimum event categories:

- launch created
- token deployed
- pool deployed
- full token supply transferred from factory to pool
- optional creator initial purchase executed
- buy executed
- sell executed
- reserves updated
- fee parameters updated
- launch fee charged
- trading fee charged
- `pauseLaunchCreation` applied
- `pauseLaunchCreation` lifted
- `pauseBuys` applied
- `pauseBuys` lifted
- `pauseAllTrading` applied
- `pauseAllTrading` lifted where legally reachable in state
- graduation threshold reached
- graduation entered `GraduationPending`
- graduation attempted
- graduation completed
- adapter migration failed, if failure is represented as an event in addition to revert-aware call patterns
- treasury updated
- adapter approved or revoked for future launches

Event design requirements:

- include relevant launch, token, pool, trader, creator, recipient, and amount identifiers
- include values in raw accounting units
- do not rely on off-chain metadata for protocol interpretation
- creator initial purchase must emit the same trade event schema as a normal buy

## 16. Custom Errors

MVP contracts must use custom errors instead of revert strings for protocol-specific failures.

Minimum error categories:

- unauthorized caller
- contract paused
- buy path paused
- all trading paused
- invalid metadata reference
- metadata hash missing
- metadata URI too long
- invalid fee parameter
- invalid graduation parameter
- invalid adapter
- invalid quote asset configuration
- zero input
- zero output
- insufficient output due to slippage
- expired deadline
- invalid recipient
- invalid creator purchase request
- trading disabled
- already graduated
- not yet eligible for graduation
- reserve threshold not met
- adapter migration failed

Exact Solidity error names are implementation details and are intentionally not specified here.

## 17. Security Invariants

- contracts are non-upgradeable in MVP
- no minting occurs after deployment
- `LaunchFactory` must have zero balance of the launch token after successful creation
- no hidden owner balance modification exists
- no transfer blacklist or freeze exists
- no transfer tax or hidden transfer hook exists
- all state-changing trade functions are reentrancy-protected
- Arc USDC transfers use `SafeERC20`
- checks-effects-interactions ordering is maintained
- zero-value trades revert
- zero-output trades revert
- creator initial purchase reuses the same pricing path as a public buy
- creator initial purchase gives no privileged price or fee treatment
- trading outside `Active` reverts
- graduation cannot execute twice
- adapter failure must not partially transfer assets
- assets remain in the pool after failed graduation attempts
- pause control cannot confiscate funds
- no use of `tx.origin`
- no arbitrary `delegatecall`
- no user-controlled external calls beyond constrained protocol dependencies
- no unbounded on-chain loops over user-controlled collections
- metadata references never control contract behavior
- no private keys or secrets may exist in the repository

## 18. Economic Invariants

- the quote asset is always Arc USDC via ERC-20 interface
- all quote accounting uses 6-decimal Arc USDC units
- native 18-decimal representations are never mixed into pool accounting
- token supply is fixed and known at launch creation
- creator initial purchase receives no privileged price path
- creator initial purchase receives no privileged fee treatment
- `realUsdcReserve` excludes `accruedProtocolFees`
- completed trades are final and not retroactively repriced
- user-backed curve reserves are distinct from protocol-owned fees
- direct donations do not change curve pricing
- direct donations do not change graduation eligibility
- post-threshold curve trading is permanently disabled once `GraduationPending` begins
- graduation cannot be repeated to extract value multiple times

## 19. Testing Requirements

Minimum deterministic test coverage must include:

- launch creation success path
- launch creation failure cases
- full token supply minted to factory then transferred to pool in the same transaction
- factory zero launch-token balance after successful creation
- revert of the entire launch transaction if any creation step fails
- optional creator initial purchase success path
- optional creator initial purchase failure cases
- creator recipient non-zero requirement
- creator initial purchase event parity with public buy event schema
- buy pricing path
- sell pricing path
- fee accounting path
- pause behavior for factory, buys, and all trading
- slippage protection on buys and sells
- deadline protection on buys and sells
- zero-input reverts
- zero-output reverts
- post-`Active` trading reverts
- threshold transition into `GraduationPending`
- permissionless `graduate()` behavior
- single-use graduation behavior
- adapter-failure behavior that leaves assets in pool and state in `GraduationPending`
- separation of protocol fees from user-backed reserves
- direct donation non-effect on pricing and graduation eligibility
- metadata reference validation behavior
- creator or admin inability to manipulate token transfer permissions

## 20. Fuzz-Testing Requirements

Fuzz testing must cover:

- randomized buy sizes across low and high reserve conditions
- randomized sell sizes across low and high reserve conditions
- fee edge cases near zero and near maximum allowed values
- deadline edge cases
- slippage edge cases
- creator initial purchase parameter combinations
- graduation threshold boundary conditions
- malformed metadata references
- reserve-accounting consistency across long trade sequences
- direct token and USDC donation scenarios
- retryable `graduate()` attempts while `GraduationPending`

## 21. Invariant-Testing Requirements

Invariant suites must prove at minimum:

- total token supply remains constant after deployment
- no address can mint additional tokens
- no address can arbitrarily burn another user's balance
- factory does not retain launch-token balance after successful launch creation
- pool quote accounting remains in 6-decimal Arc USDC units
- fee balances never exceed the amount implied by completed trades
- user-backed curve reserves are never withdrawable through fee paths
- direct donations do not alter internal pricing state
- once `GraduationPending` is reached, trading never resumes
- once `Graduated`, a pool cannot return to any earlier state
- once paused, protected entrypoints remain inaccessible until legally unpaused
- repeated buys and sells do not break reserve-accounting consistency

## 22. Explicitly Unresolved Protocol Parameters

The following parameters are intentionally unresolved and must remain unset in this document:

- exact constant-product equations
- normalization between 6-decimal Arc USDC and 18-decimal launch tokens
- exact rounding implementation details
- virtual token reserve value
- virtual USDC reserve value
- graduation Arc USDC reserve threshold
- launch fee amount
- trading fee amounts
- hard maximum fee value
- destination and proportions of Arc USDC and unused tokens at graduation
- exact adapter behavior details
- minimum trade amount

These unresolved items must be finalized in a later parameterization and implementation review before production deployment.

## 23. Blocking Decisions Before LaunchPool Implementation

The following items are explicit blockers and must be finalized before `LaunchPool` Solidity implementation begins:

- exact constant-product equations
- normalization between 6-decimal Arc USDC and 18-decimal launch tokens
- rounding rules
- virtual reserve values
- fee values and hard maximum
- graduation threshold
- destination and proportions of Arc USDC and unused tokens at graduation
- adapter behavior
- minimum trade amount

No numerical values are invented in this document for any of those items.

## 24. Out-of-Scope Functionality

- on-chain metadata storage
- metadata moderation
- NFT features
- creator vesting
- creator token allocation outside market purchases
- token taxes
- rebasing
- blacklist or freeze controls
- transfer restrictions after launch
- leveraged trading
- multi-quote-asset support
- stable-swap or order-book models
- governance token mechanics
- staking
- referral systems
- WalletConnect or frontend wallet behavior
- secret management
- backend custody

## 25. Mainnet-Readiness Checklist

- unresolved protocol parameters finalized by formal review
- exact curve equations approved
- normalization and rounding model approved
- graduation asset destinations finalized and tested
- multisig chosen and documented
- delayed or two-step default-admin model deployed
- timelock selected for sensitive config changes
- all privileged roles assigned to multisig-controlled addresses
- treasury address configured and timelocked
- adapter policy finalized for production
- disabled adapter removed or made unavailable in production
- external audit completed
- high-severity issues fixed
- economic review of curve parameters completed
- formal fee bounds approved
- full unit, fuzz, and invariant suites passing
- emergency pause procedures documented
- reserve-accounting model independently reviewed
- no private keys or secrets committed to the repository
- deployment checklist and runbook completed

## Protocol Constants and Known Network Inputs

- Arc Testnet chain ID: `5042002`
- Quote asset: Arc USDC ERC-20 interface
- Arc USDC contract: `0x3600000000000000000000000000000000000000`
- Arc USDC decimals: `6`
- Native gas-token representation: `18` decimals
- Default token supply: `1,000,000,000`
- Launch token decimals: `18`

## Metadata Rules

- metadata never controls contract behavior
- duplicate names and symbols are allowed unless a later product rule explicitly changes that policy
- metadata should prefer an immutable content hash plus an optional bounded URI
- empty metadata content hashes must revert
- oversized metadata URIs must revert
- optional URIs may be empty
- exact max-length constants are implementation parameters to finalize before coding

## Final Constraint Summary

- all protocol trading and accounting uses ERC-20 Arc USDC with 6 decimals
- native 18-decimal units must never be mixed into protocol quote accounting
- token metadata is off-chain and referenced only
- metadata must never control contract behavior
- creator initial purchase is atomic with launch creation when used
- graduation is permissionless once eligible
- the state machine is `Active -> GraduationPending -> Graduated`
- no Solidity is implemented by this document
