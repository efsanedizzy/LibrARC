// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title BondingCurveMath
/// @notice Pure virtual-reserve constant-product math for LibrARC launch-pool quoting.
library BondingCurveMath {
    /// @notice Basis-point denominator used for fee calculations.
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /// @notice Reverts when a required trade input amount is zero.
    error ZeroInput();

    /// @notice Reverts when a computed trade output amount is zero.
    error ZeroOutput();

    /// @notice Reverts when fee basis points are greater than or equal to 10,000.
    error InvalidFeeBps();

    /// @notice Reverts when the total token supply is zero.
    error InvalidTotalSupply();

    /// @notice Reverts when initialization starts with non-zero real USDC reserves.
    error InvalidInitialRealUsdcReserve();

    /// @notice Reverts when initialization starts with non-zero accrued protocol fees.
    error InvalidInitialProtocolFees();

    /// @notice Reverts when initialization does not assign the full token supply to the pool.
    error InvalidInitialTokenReserve();

    /// @notice Reverts when the virtual USDC reserve is zero.
    error ZeroVirtualUsdcReserve();

    /// @notice Reverts when the virtual token reserve is zero.
    error ZeroVirtualTokenReserve();

    /// @notice Reverts when the effective USDC reserve is zero.
    error ZeroEffectiveUsdcReserve();

    /// @notice Reverts when the effective token reserve is zero.
    error ZeroEffectiveTokenReserve();

    /// @notice Reverts when a buy quote would consume more real tokens than are available.
    error InsufficientRealTokenReserve();

    /// @notice Reverts when a sell quote would consume more real USDC than is available.
    error InsufficientRealUsdcReserve();

    /// @notice Reverts when a sell would push the real token reserve above the fixed total supply.
    error TokenReserveExceedsTotalSupply();

    /// @notice Internal accounting state used by the bonding curve.
    /// @param realUsdcReserve User-backed USDC reserve that participates in graduation checks.
    /// @param realTokenReserve User-backed token reserve available for bonding-curve trading.
    /// @param virtualUsdcReserve Synthetic USDC reserve used only for pricing.
    /// @param virtualTokenReserve Synthetic token reserve used only for pricing.
    /// @param accruedProtocolFees Protocol-owned USDC fees excluded from pricing.
    struct CurveState {
        uint256 realUsdcReserve;
        uint256 realTokenReserve;
        uint256 virtualUsdcReserve;
        uint256 virtualTokenReserve;
        uint256 accruedProtocolFees;
    }

    /// @notice Full buy-quote result plus the next internal curve state.
    /// @param fee Protocol fee charged on the input USDC amount.
    /// @param netUsdcIn USDC added to real reserves after fees.
    /// @param tokenAmountOut Tokens dispensed from the pool.
    /// @param nextState Curve state after applying the buy.
    struct BuyQuote {
        uint256 fee;
        uint256 netUsdcIn;
        uint256 tokenAmountOut;
        CurveState nextState;
    }

    /// @notice Full sell-quote result plus the next internal curve state.
    /// @param fee Protocol fee charged on the gross USDC output.
    /// @param grossUsdcAmountOut USDC removed from real reserves before fees.
    /// @param netUsdcAmountOut USDC received by the seller after fees.
    /// @param nextState Curve state after applying the sell.
    struct SellQuote {
        uint256 fee;
        uint256 grossUsdcAmountOut;
        uint256 netUsdcAmountOut;
        CurveState nextState;
    }

    /// @notice Validates the required initial accounting state for a fresh launch pool.
    /// @param state Initial curve state to validate.
    /// @param totalTokenSupply Fixed token supply assigned to the launch pool.
    function validateInitialization(CurveState memory state, uint256 totalTokenSupply) internal pure {
        if (totalTokenSupply == 0) revert InvalidTotalSupply();
        if (state.realUsdcReserve != 0) revert InvalidInitialRealUsdcReserve();
        if (state.accruedProtocolFees != 0) revert InvalidInitialProtocolFees();
        if (state.realTokenReserve != totalTokenSupply) revert InvalidInitialTokenReserve();
        if (state.virtualUsdcReserve == 0) revert ZeroVirtualUsdcReserve();
        if (state.virtualTokenReserve == 0) revert ZeroVirtualTokenReserve();

        (uint256 effectiveUsdcReserve, uint256 effectiveTokenReserve) = effectiveReserves(state);

        if (effectiveUsdcReserve == 0) revert ZeroEffectiveUsdcReserve();
        if (effectiveTokenReserve == 0) revert ZeroEffectiveTokenReserve();
    }

    /// @notice Computes the internal effective reserves used for pricing.
    /// @param state Curve state to evaluate.
    /// @return effectiveUsdcReserve Real plus virtual USDC reserve.
    /// @return effectiveTokenReserve Real plus virtual token reserve.
    function effectiveReserves(CurveState memory state)
        internal
        pure
        returns (uint256 effectiveUsdcReserve, uint256 effectiveTokenReserve)
    {
        effectiveUsdcReserve = state.realUsdcReserve + state.virtualUsdcReserve;
        effectiveTokenReserve = state.realTokenReserve + state.virtualTokenReserve;
    }

    /// @notice Quotes a buy against the current virtual-reserve constant-product state.
    /// @param state Current curve state.
    /// @param usdcAmountIn Gross USDC input amount.
    /// @param buyFeeBps Buy fee in basis points.
    /// @return quote Buy result including the next curve state.
    function quoteBuy(CurveState memory state, uint256 usdcAmountIn, uint256 buyFeeBps)
        internal
        pure
        returns (BuyQuote memory quote)
    {
        if (usdcAmountIn == 0) revert ZeroInput();
        if (buyFeeBps >= BPS_DENOMINATOR) revert InvalidFeeBps();

        uint256 fee = Math.mulDiv(usdcAmountIn, buyFeeBps, BPS_DENOMINATOR);
        uint256 netUsdcIn = usdcAmountIn - fee;
        if (netUsdcIn == 0) revert ZeroInput();

        (uint256 effectiveUsdcReserve, uint256 effectiveTokenReserve) = effectiveReserves(state);
        uint256 newEffectiveUsdcReserve = effectiveUsdcReserve + netUsdcIn;
        uint256 newEffectiveTokenReserve =
            Math.mulDiv(effectiveUsdcReserve, effectiveTokenReserve, newEffectiveUsdcReserve, Math.Rounding.Ceil);
        uint256 tokenAmountOut = effectiveTokenReserve - newEffectiveTokenReserve;

        if (tokenAmountOut == 0) revert ZeroOutput();
        if (tokenAmountOut > state.realTokenReserve) revert InsufficientRealTokenReserve();

        CurveState memory nextState = CurveState({
            realUsdcReserve: state.realUsdcReserve + netUsdcIn,
            realTokenReserve: state.realTokenReserve - tokenAmountOut,
            virtualUsdcReserve: state.virtualUsdcReserve,
            virtualTokenReserve: state.virtualTokenReserve,
            accruedProtocolFees: state.accruedProtocolFees + fee
        });

        quote = BuyQuote({fee: fee, netUsdcIn: netUsdcIn, tokenAmountOut: tokenAmountOut, nextState: nextState});
    }

    /// @notice Quotes a sell against the current virtual-reserve constant-product state.
    /// @param state Current curve state.
    /// @param tokenAmountIn Token input amount.
    /// @param sellFeeBps Sell fee in basis points.
    /// @param totalTokenSupply Fixed total token supply enforced by the protocol.
    /// @return quote Sell result including the next curve state.
    function quoteSell(CurveState memory state, uint256 tokenAmountIn, uint256 sellFeeBps, uint256 totalTokenSupply)
        internal
        pure
        returns (SellQuote memory quote)
    {
        if (tokenAmountIn == 0) revert ZeroInput();
        if (sellFeeBps >= BPS_DENOMINATOR) revert InvalidFeeBps();

        uint256 nextRealTokenReserve = state.realTokenReserve + tokenAmountIn;
        if (nextRealTokenReserve > totalTokenSupply) revert TokenReserveExceedsTotalSupply();

        (uint256 effectiveUsdcReserve, uint256 effectiveTokenReserve) = effectiveReserves(state);
        uint256 newEffectiveTokenReserve = effectiveTokenReserve + tokenAmountIn;
        uint256 newEffectiveUsdcReserve =
            Math.mulDiv(effectiveUsdcReserve, effectiveTokenReserve, newEffectiveTokenReserve, Math.Rounding.Ceil);
        uint256 grossUsdcAmountOut = effectiveUsdcReserve - newEffectiveUsdcReserve;

        if (grossUsdcAmountOut == 0) revert ZeroOutput();
        if (grossUsdcAmountOut > state.realUsdcReserve) revert InsufficientRealUsdcReserve();

        uint256 fee = Math.mulDiv(grossUsdcAmountOut, sellFeeBps, BPS_DENOMINATOR);
        uint256 netUsdcAmountOut = grossUsdcAmountOut - fee;
        if (netUsdcAmountOut == 0) revert ZeroOutput();

        CurveState memory nextState = CurveState({
            realUsdcReserve: state.realUsdcReserve - grossUsdcAmountOut,
            realTokenReserve: nextRealTokenReserve,
            virtualUsdcReserve: state.virtualUsdcReserve,
            virtualTokenReserve: state.virtualTokenReserve,
            accruedProtocolFees: state.accruedProtocolFees + fee
        });

        quote = SellQuote({
            fee: fee, grossUsdcAmountOut: grossUsdcAmountOut, netUsdcAmountOut: netUsdcAmountOut, nextState: nextState
        });
    }
}
