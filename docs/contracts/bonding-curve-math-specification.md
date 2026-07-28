# LibrARC Bonding Curve Math Specification

Status: Draft MVP mathematical specification  
Date: July 28, 2026  
Network: Arc Testnet  
Chain ID: `5042002`

## 1. Purpose

This document defines the official mathematical specification for the LibrARC virtual-reserve constant-product bonding curve.

It exists to:

- define the exact accounting variables used by the launch protocol
- define the buy and sell equations in integer arithmetic
- separate user-backed reserves from protocol-owned fees
- define rounding behavior before Solidity implementation
- prevent ambiguity around reserve accounting, donations, and graduation

This document is intentionally not a Solidity design and does not implement any contract code.

## 2. Units and Decimal Conventions

All protocol arithmetic is integer arithmetic only.

Rules:

- Arc USDC ERC-20 uses 6 decimals
- LibrARC launch tokens use 18 decimals
- floating-point arithmetic is forbidden
- native 18-decimal gas-token accounting must never be used in the bonding curve
- all quote-asset accounting uses Arc USDC ERC-20 6-decimal units
- all launch-token accounting uses 18-decimal token units

Implications:

- a raw Arc USDC amount is always interpreted in 6-decimal units
- a raw launch-token amount is always interpreted in 18-decimal units
- any future cross-unit normalization must be explicit, deterministic, and fixed by protocol rules
- no formula may silently assume 18-decimal quote-asset behavior

## 3. State Variables

The curve math relies on exactly these internal accounting variables:

- `realUsdcReserve`
- `realTokenReserve`
- `virtualUsdcReserve`
- `virtualTokenReserve`
- `accruedProtocolFees`

Definitions:

- `realUsdcReserve`
  - accounted Arc USDC reserves backing the user-facing bonding curve
  - stored in 6-decimal Arc USDC units
  - excludes protocol-owned fees
- `realTokenReserve`
  - accounted launch-token reserves held for curve trading
  - stored in 18-decimal launch-token units
- `virtualUsdcReserve`
  - synthetic Arc USDC reserve parameter used to shape the curve
  - stored in 6-decimal Arc USDC units
- `virtualTokenReserve`
  - synthetic launch-token reserve parameter used to shape the curve
  - stored in 18-decimal launch-token units
- `accruedProtocolFees`
  - protocol-owned Arc USDC fees accumulated from trades
  - stored in 6-decimal Arc USDC units
  - excluded from curve reserve accounting

Initialization requirements:

- `realUsdcReserve = 0`
- `realTokenReserve = complete fixed token supply`
- `accruedProtocolFees = 0`
- `virtualUsdcReserve > 0`
- `virtualTokenReserve > 0`
- `effectiveUsdcReserve > 0`
- `effectiveTokenReserve > 0`
- `realTokenReserve <= total token supply`

Invalid initialization must revert.

## 4. Effective Reserves

The curve uses effective reserves derived from internal accounting.

Definitions:

- `effectiveUsdcReserve = realUsdcReserve + virtualUsdcReserve`
- `effectiveTokenReserve = realTokenReserve + virtualTokenReserve`

Rules:

- pricing uses effective reserves, not raw ERC-20 `balanceOf` values
- direct donations must not modify effective reserves unless explicitly accounted through state updates
- virtual reserves influence pricing but are not user-withdrawable balances
- pricing must still use internal accounting even when raw balances are higher or lower than accounted values

## 5. Constant-Product Invariant

The pre-trade invariant is:

- `k = effectiveUsdcReserve * effectiveTokenReserve`

Interpretation:

- `k` is evaluated from internal accounted reserves before a trade is applied
- `k` is the reference value for buy and sell calculations
- due to integer rounding, the post-trade effective reserve product may stay equal to or increase above the pre-trade value
- rounding must never cause the effective reserve product to decrease

This document does not finalize alternative rearrangements or optimized computation strategies. It defines the canonical mathematical relationship only.

Implementation safety requirement:

- Solidity must not calculate `k = effectiveUsdcReserve * effectiveTokenReserve` as an unchecked intermediate `uint256` multiplication
- Solidity must use an audited full-precision multiplication and division approach equivalent to OpenZeppelin `Math.mulDiv`
- upward rounding must be used where this specification requires ceiling division
- the conceptual invariant `k` remains valid mathematically, but implementation must avoid overflowing intermediate products

## 6. Buy Equation

Buy input:

- user supplies `usdcAmountIn`

Preconditions:

- `usdcAmountIn` must be non-zero
- buy fee uses the configured buy-fee basis points
- `buyFeeBps < 10_000`
- pricing is based on internal accounting values only

Buy steps:

1. Calculate buy fee:
   - `fee = floor(usdcAmountIn * buyFeeBps / 10_000)`
   - fee calculation must use full-precision `mulDiv`
2. Separate fee accounting from reserves.
3. Calculate net reserve contribution:
   - `netUsdcIn = usdcAmountIn - fee`
4. Require:
   - `netUsdcIn > 0`
5. Compute post-trade USDC effective reserve:
   - `newEffectiveUsdcReserve = effectiveUsdcReserve + netUsdcIn`
6. Compute post-trade token effective reserve using full-precision multiplication and division with upward rounding:
   - `newEffectiveTokenReserve = ceil(effectiveUsdcReserve * effectiveTokenReserve / newEffectiveUsdcReserve)`
   - Solidity should use an audited equivalent to OpenZeppelin `Math.mulDiv(..., Math.Rounding.Ceil)`
7. Compute token output:
   - `tokenAmountOut = effectiveTokenReserve - newEffectiveTokenReserve`

Buy output rules:

- buy output must round down in favor of protocol solvency
- values greater than or equal to `10_000` basis points must revert
- `tokenAmountOut` must be non-zero
- `tokenAmountOut` must not exceed `realTokenReserve`
- `netUsdcIn` must be non-zero
- if `tokenAmountOut == 0`, the transaction reverts
- if `tokenAmountOut > realTokenReserve`, the transaction reverts
- if `buyFeeBps >= 10_000`, the transaction reverts
- if `netUsdcIn == 0`, the transaction reverts

Buy state update:

- `realUsdcReserve += netUsdcIn`
- `realTokenReserve -= tokenAmountOut`
- `accruedProtocolFees += fee`

Creator initial purchase:

- uses the same buy equation
- uses the same buy fee rules
- uses the same rounding behavior
- contributes to `realUsdcReserve` and graduation eligibility exactly like any public buy

## 7. Sell Equation

Sell input:

- user supplies `tokenAmountIn`

Preconditions:

- `tokenAmountIn` must be non-zero
- `sellFeeBps < 10_000`
- pricing is based on internal accounting values only

Sell steps:

1. Compute post-trade token effective reserve:
   - `newEffectiveTokenReserve = effectiveTokenReserve + tokenAmountIn`
2. Compute post-trade USDC effective reserve using full-precision multiplication and division with upward rounding:
   - `newEffectiveUsdcReserve = ceil(effectiveUsdcReserve * effectiveTokenReserve / newEffectiveTokenReserve)`
   - Solidity should use an audited equivalent to OpenZeppelin `Math.mulDiv(..., Math.Rounding.Ceil)`
3. Compute gross Arc USDC output:
   - `grossUsdcAmountOut = effectiveUsdcReserve - newEffectiveUsdcReserve`
4. Calculate sell fee from `grossUsdcAmountOut`:
   - `fee = floor(grossUsdcAmountOut * sellFeeBps / 10_000)`
   - fee calculation must use full-precision `mulDiv`
5. Compute net Arc USDC output:
   - `netUsdcAmountOut = grossUsdcAmountOut - fee`

Sell output rules:

- sell outputs must round down in favor of protocol solvency
- values greater than or equal to `10_000` basis points must revert
- `grossUsdcAmountOut` must not exceed `realUsdcReserve`
- `netUsdcAmountOut` must be non-zero
- if `grossUsdcAmountOut > realUsdcReserve`, the transaction reverts
- if `netUsdcAmountOut == 0`, the transaction reverts
- if `sellFeeBps >= 10_000`, the transaction reverts

Sell state update:

- `realTokenReserve += tokenAmountIn`
- `realUsdcReserve -= grossUsdcAmountOut`
- `accruedProtocolFees += fee`

Important accounting note:

- fees are added to `accruedProtocolFees`
- fees are not counted inside `realUsdcReserve`
- the subtraction from `realUsdcReserve` is based on `grossUsdcAmountOut`, because user-backed reserves are reduced before the fee is carved out into protocol-owned accounting

## 8. Fee Calculation

Fee denominator:

- basis-point denominator is `10_000`

Fee formula:

- `fee = floor(amount * feeBps / 10_000)`

Chosen rounding direction:

- fee calculation rounds down

Reason:

- floor rounding prevents fee collection above the mathematically implied amount
- solvency is still preserved because trade outputs themselves also round down through the curve equations

Rules:

- fee values remain unresolved in this document
- hard maximum fee remains unresolved in this document
- any future protocol hard maximum must be less than `10_000`
- fee multiplication and division must be overflow-safe
- fee calculations must use full-precision `mulDiv`
- `feeBps` must be less than `10_000`
- values greater than or equal to `10_000` basis points must revert
- creator initial purchases use the same buy fee and pricing equations
- protocol fees are never included in `realUsdcReserve`
- graduation migrates user-backed reserves, not `accruedProtocolFees`
- fee transfer to a fee vault must not change curve accounting semantics

Fee sweeping requirements:

- fees accrue inside `accruedProtocolFees`
- fee sweeping must never reduce `realUsdcReserve`
- sweep amount must not exceed `accruedProtocolFees`
- `accruedProtocolFees` must be reduced before the external transfer
- fee transfers may only go to the configured `FeeVault`
- failed fee transfer must revert the complete sweep
- graduation migrates only `realUsdcReserve` and `realTokenReserve`
- `accruedProtocolFees` remain protocol-owned and excluded from migration
- fee sweeping cannot change quotes
- fee sweeping cannot change graduation eligibility

## 9. Rounding Rules

All rounding must favor protocol solvency.

### 9.1 Ceiling Division

For positive integers `a` and `b`, with `b > 0`:

- `ceil(a / b) = a / b + (a % b == 0 ? 0 : 1)`

This is the required meaning of ceiling division throughout this document.

Implementation requirement:

- Solidity must use an overflow-safe audited equivalent such as OpenZeppelin `Math.ceilDiv`

### 9.2 Required Rounding Behavior

- buy token output rounds down
- sell Arc USDC output rounds down
- required input calculations round up when reverse quotes are later supported
- fee calculations round down
- zero-output transactions revert

### 9.3 Product Preservation

Because `newEffectiveTokenReserve` and `newEffectiveUsdcReserve` are computed with ceiling division:

- the post-trade effective reserve product must not be less than the pre-trade `k`
- rounding may leave small residual value in the pool
- rounding must never create an under-collateralized reserve state

## 10. State Updates

State updates are part of the mathematical specification because they determine the next trade price.

Buy update:

- `realUsdcReserve_next = realUsdcReserve + netUsdcIn`
- `realTokenReserve_next = realTokenReserve - tokenAmountOut`
- `virtualUsdcReserve_next = virtualUsdcReserve`
- `virtualTokenReserve_next = virtualTokenReserve`
- `accruedProtocolFees_next = accruedProtocolFees + fee`

Sell update:

- `realTokenReserve_next = realTokenReserve + tokenAmountIn`
- `realUsdcReserve_next = realUsdcReserve - grossUsdcAmountOut`
- `virtualUsdcReserve_next = virtualUsdcReserve`
- `virtualTokenReserve_next = virtualTokenReserve`
- `accruedProtocolFees_next = accruedProtocolFees + fee`

General requirements:

- raw token or Arc USDC transfers must not directly mutate these accounting variables
- state transitions must be deterministic for the same input state and parameters
- balance solvency checks must hold at all times:
  - `balanceOf(pool, Arc USDC) >= realUsdcReserve + accruedProtocolFees`
  - `balanceOf(pool, launchToken) >= realTokenReserve`
- balances above accounted values are donations or excess balances
- balances below accounted values are critical invariant violations

## 11. Quote-Function Requirements

Any future quote functions must match the exact state-changing formulas, except that they do not mutate state.

Required quote behavior:

- use internal accounting variables as inputs
- use the same fee formulas as execution paths
- use the same ceiling-division rules as execution paths
- use the same output-rounding direction as execution paths
- revert or signal invalidity for zero-output results
- never read raw ERC-20 balances as authoritative pricing inputs

If reverse quote functions are later added, they must:

- round required inputs up
- preserve solvency under actual execution
- include fee effects explicitly

## 12. Donation and Excess-Balance Behavior

Internal accounting is authoritative.

Rules:

- raw ERC-20 `balanceOf` values must not determine pricing
- direct token transfers to the pool must not change:
  - pricing
  - internal reserves
  - fees
  - graduation eligibility
- direct Arc USDC transfers to the pool must not change:
  - pricing
  - internal reserves
  - fees
  - graduation eligibility

Reserve safety rules:

- accounted reserves must never be recoverable by an administrator
- any future excess-token recovery must exclude all accounted reserves
- any future excess-token recovery rule must prove that only non-accounted excess is recoverable
- this document does not authorize any excess-Arc-USDC recovery path
- direct donations cannot satisfy balance deficits in internal accounting semantics

## 13. Graduation Calculation

Graduation threshold evaluation uses:

- `realUsdcReserve` only
- Arc USDC ERC-20 6-decimal units only
- a threshold greater than zero

Explicit exclusions:

- `accruedProtocolFees` is excluded
- direct Arc USDC donations are excluded because they do not update internal accounting
- direct token donations are excluded because they do not update internal accounting

Buy-capacity rule:

- `nextRealUsdcReserve = currentRealUsdcReserve + netUsdcIn`
- a buy is accepted only when `nextRealUsdcReserve <= graduationThreshold`
- equality is allowed
- only values above the threshold revert
- no reserve overshoot is permitted
- no partial fill is permitted
- no automatic refund is permitted
- the user must submit a smaller input when the buy exceeds the remaining capacity
- creator initial purchases follow the exact same rule as public buys
- slippage and deadline protections still apply

Graduation trigger rule:

- when `nextRealUsdcReserve == graduationThreshold` after a successful buy, pool state changes from `Active` to `GraduationPending`

Revert effects for threshold-exceeding buys:

- no USDC is transferred
- no launch tokens are transferred
- no fees are collected
- internal reserves do not change
- graduation state does not change
- no successful trade event is emitted

State implications:

- trading is disabled in `GraduationPending`
- post-graduation trades always revert

Unresolved item:

- exact graduation threshold remains unresolved
- the UI may later quote the remaining capacity, but the contract remains the source of truth

## 14. Mathematical Invariants

- `realUsdcReserve` never includes protocol fees
- `accruedProtocolFees` never affects pricing
- `realTokenReserve` cannot become negative
- `realUsdcReserve` cannot become negative
- `realTokenReserve` can never exceed total token supply
- `realTokenReserve` plus tokens outside the pool cannot exceed total supply
- output cannot exceed available real reserves
- net buy reserve contribution must be non-zero
- effective reserve denominators must never be zero
- effective reserve product must not decrease because of rounding
- completed trades cannot be retroactively repriced
- direct donations cannot change internal accounting
- total launch-token supply remains constant
- post-graduation trades always revert

Additional derived invariants:

- if `tokenAmountOut > 0`, then `realTokenReserve_next < realTokenReserve`
- if `grossUsdcAmountOut > 0`, then `realUsdcReserve_next < realUsdcReserve`
- if `fee > 0`, then `accruedProtocolFees_next > accruedProtocolFees`
- `effectiveUsdcReserve` and `effectiveTokenReserve` remain strictly positive if initialization parameters are valid
- fee sweeping cannot change quotes
- fee sweeping cannot change graduation eligibility
- if `nextRealUsdcReserve > graduationThreshold`, the buy reverts before any asset transfer or state change

## 15. Security Requirements

- all calculations must use integer arithmetic only
- floating-point arithmetic is forbidden
- overflow-safe multiplication and division are required
- full-precision multiplication and division with upward rounding are required where ceiling reserve updates are specified
- zero-output buy and sell transactions must revert
- direct donations must not influence pricing
- direct donations must not influence graduation eligibility
- accounted reserves must not be recoverable by any administrator
- fee accounting must remain separate from user-backed reserves
- no mathematical path may depend on native 18-decimal gas-token accounting
- quote logic and execution logic must remain mathematically identical except for state mutation

## 16. Deterministic Test Requirements

Deterministic tests must cover at minimum:

- effective reserve calculation from real plus virtual reserves
- initialization with zero virtual reserves reverting
- exact buy fee calculation from basis points
- exact sell fee calculation from basis points
- `ceilDiv` behavior near `uint256` maximum values
- full-precision `mulDiv` behavior with upward rounding
- buy equation with known integer inputs
- sell equation with known integer inputs
- buy state updates
- sell state updates
- fee sweep accounting
- zero-input buy rejection
- zero-input sell rejection
- zero net buy input after fee rejection
- zero-output buy rejection
- zero-output sell rejection
- `feeBps` equal to or above `10_000` reverting
- rejection when buy output exceeds `realTokenReserve`
- rejection when gross sell output exceeds `realUsdcReserve`
- pool balances always covering accounted reserves
- donation balances remaining excluded from pricing and accounting
- graduation threshold uses `realUsdcReserve` only
- graduation ignores `accruedProtocolFees`
- threshold-exceeding buys reverting without side effects
- creator initial purchase matches the same buy equation as public buy

## 17. Fuzz-Test Requirements

Fuzz tests must cover:

- randomized buy sizes over a wide reserve range
- randomized sell sizes over a wide reserve range
- fee edge cases near zero and near the future maximum
- `ceilDiv` edge cases near `uint256` maximum values
- full-precision `mulDiv` edge cases
- donation scenarios that change raw balances but not internal accounting
- pool balance coverage over accounted reserves
- fee sweep state transitions
- repeated buy and sell sequences with invariant checks after every step
- boundary cases where outputs approach zero
- boundary cases where net inputs approach zero because of fee configuration
- boundary cases where buy output approaches `realTokenReserve`
- boundary cases where gross sell output approaches `realUsdcReserve`
- graduation threshold boundary conditions after successful buys
- equality with the graduation threshold succeeding
- values above the graduation threshold reverting without side effects

## 18. Invariant-Test Requirements

Invariant tests must prove at minimum:

- `realUsdcReserve` excludes `accruedProtocolFees`
- `accruedProtocolFees` never affects price quotes
- `realTokenReserve` never underflows
- `realUsdcReserve` never underflows
- pool balances always cover accounted reserves
- effective reserve product does not decrease due to rounding
- direct donations do not alter internal accounting
- direct donations do not alter pricing
- direct donations do not alter graduation eligibility
- fee sweeping does not alter quotes
- fee sweeping does not alter graduation eligibility
- zero-output transactions never succeed
- total launch-token supply remains constant across all completed trades
- once the pool enters `GraduationPending`, all trades revert

## 19. Blocking Unresolved Parameters

The following parameters remain unresolved and block final BondingCurve implementation:

- `virtualUsdcReserve` value
- `virtualTokenReserve` value
- buy fee
- sell fee
- hard maximum fee
- graduation threshold
- minimum Arc USDC trade
- minimum token trade
- graduation asset proportions and destinations
- fee sweep timing and frequency
- whether excess token balances are permanently locked or narrowly recoverable

This document does not invent numerical values for any of those items.

## 20. Solidity Implementation Checklist

- keep all math in integer arithmetic
- never use floating-point arithmetic
- store Arc USDC values in 6-decimal units only
- store launch-token values in 18-decimal units only
- use overflow-safe audited `ceilDiv` logic such as OpenZeppelin `Math.ceilDiv`
- use full-precision audited `mulDiv` logic with upward rounding such as OpenZeppelin `Math.mulDiv`
- implement exact internal variables:
  - `realUsdcReserve`
  - `realTokenReserve`
  - `virtualUsdcReserve`
  - `virtualTokenReserve`
  - `accruedProtocolFees`
- require positive virtual reserves at initialization
- compute effective reserves from internal accounting only
- avoid unchecked intermediate multiplication of effective reserves
- use ceiling division exactly as specified
- ensure buy outputs round down
- ensure sell outputs round down
- ensure reverse required-input quotes round up when later supported
- reject `feeBps >= 10_000`
- revert on zero-output trades
- revert on zero net reserve contribution after fee
- reject outputs above available real reserves
- exclude `accruedProtocolFees` from graduation calculations
- reject buys when `nextRealUsdcReserve > graduationThreshold`
- allow buys when `nextRealUsdcReserve == graduationThreshold` and then transition to `GraduationPending`
- ensure direct donations do not modify internal accounting
- ensure internal accounting, not raw balances, drives pricing
- ensure pool raw balances always cover accounted reserves
- ensure fee sweeps reduce `accruedProtocolFees` before external transfer
- ensure fee sweeps transfer only to the configured `FeeVault`
- ensure successful buy-triggered threshold transitions move `Active` to `GraduationPending`
- ensure trading is disabled in `GraduationPending`
