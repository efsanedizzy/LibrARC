// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {stdError} from "forge-std/StdError.sol";

import {BondingCurveMath} from "../src/libraries/BondingCurveMath.sol";

contract BondingCurveMathHarness {
    function validateInitialization(BondingCurveMath.CurveState memory state, uint256 totalTokenSupply) external pure {
        BondingCurveMath.validateInitialization(state, totalTokenSupply);
    }

    function effectiveReserves(BondingCurveMath.CurveState memory state) external pure returns (uint256, uint256) {
        return BondingCurveMath.effectiveReserves(state);
    }

    function quoteBuy(BondingCurveMath.CurveState memory state, uint256 usdcAmountIn, uint256 buyFeeBps)
        external
        pure
        returns (BondingCurveMath.BuyQuote memory)
    {
        return BondingCurveMath.quoteBuy(state, usdcAmountIn, buyFeeBps);
    }

    function quoteSell(
        BondingCurveMath.CurveState memory state,
        uint256 tokenAmountIn,
        uint256 sellFeeBps,
        uint256 totalTokenSupply
    ) external pure returns (BondingCurveMath.SellQuote memory) {
        return BondingCurveMath.quoteSell(state, tokenAmountIn, sellFeeBps, totalTokenSupply);
    }

    function quoteBuyEchoState(BondingCurveMath.CurveState memory state, uint256 usdcAmountIn, uint256 buyFeeBps)
        external
        pure
        returns (
            BondingCurveMath.CurveState memory originalState,
            BondingCurveMath.CurveState memory stateAfter,
            BondingCurveMath.BuyQuote memory quote
        )
    {
        originalState = state;
        quote = BondingCurveMath.quoteBuy(state, usdcAmountIn, buyFeeBps);
        stateAfter = state;
    }

    function quoteSellEchoState(
        BondingCurveMath.CurveState memory state,
        uint256 tokenAmountIn,
        uint256 sellFeeBps,
        uint256 totalTokenSupply
    )
        external
        pure
        returns (
            BondingCurveMath.CurveState memory originalState,
            BondingCurveMath.CurveState memory stateAfter,
            BondingCurveMath.SellQuote memory quote
        )
    {
        originalState = state;
        quote = BondingCurveMath.quoteSell(state, tokenAmountIn, sellFeeBps, totalTokenSupply);
        stateAfter = state;
    }
}

contract BondingCurveMathTest is Test {
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    BondingCurveMathHarness internal harness;

    function setUp() public {
        harness = new BondingCurveMathHarness();
    }

    function test_ValidInitializationSucceeds() public view {
        BondingCurveMath.CurveState memory state = _initialState();

        harness.validateInitialization(state, TOTAL_SUPPLY);
    }

    function test_RevertWhenInitializationTotalSupplyIsZero() public {
        vm.expectRevert(BondingCurveMath.InvalidTotalSupply.selector);
        harness.validateInitialization(_initialState(), 0);
    }

    function test_RevertWhenInitializationVirtualUsdcReserveIsZero() public {
        BondingCurveMath.CurveState memory state = _initialState();
        state.virtualUsdcReserve = 0;

        vm.expectRevert(BondingCurveMath.ZeroVirtualUsdcReserve.selector);
        harness.validateInitialization(state, TOTAL_SUPPLY);
    }

    function test_RevertWhenInitializationVirtualTokenReserveIsZero() public {
        BondingCurveMath.CurveState memory state = _initialState();
        state.virtualTokenReserve = 0;

        vm.expectRevert(BondingCurveMath.ZeroVirtualTokenReserve.selector);
        harness.validateInitialization(state, TOTAL_SUPPLY);
    }

    function test_RevertWhenInitializationTokenReserveDoesNotMatchSupply() public {
        BondingCurveMath.CurveState memory state = _initialState();
        state.realTokenReserve = TOTAL_SUPPLY - 1;

        vm.expectRevert(BondingCurveMath.InvalidInitialTokenReserve.selector);
        harness.validateInitialization(state, TOTAL_SUPPLY);
    }

    function test_RevertWhenInitializationRealUsdcReserveIsNonZero() public {
        BondingCurveMath.CurveState memory state = _initialState();
        state.realUsdcReserve = 1;

        vm.expectRevert(BondingCurveMath.InvalidInitialRealUsdcReserve.selector);
        harness.validateInitialization(state, TOTAL_SUPPLY);
    }

    function test_RevertWhenInitializationAccruedFeesAreNonZero() public {
        BondingCurveMath.CurveState memory state = _initialState();
        state.accruedProtocolFees = 1;

        vm.expectRevert(BondingCurveMath.InvalidInitialProtocolFees.selector);
        harness.validateInitialization(state, TOTAL_SUPPLY);
    }

    function test_EffectiveReserveCalculationsAreCorrect() public view {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 125,
            realTokenReserve: 900,
            virtualUsdcReserve: 75,
            virtualTokenReserve: 100,
            accruedProtocolFees: 777
        });

        (uint256 effectiveUsdcReserve, uint256 effectiveTokenReserve) = harness.effectiveReserves(state);

        assertEq(effectiveUsdcReserve, 200);
        assertEq(effectiveTokenReserve, 1000);
    }

    function test_KnownBuyQuoteWithZeroFee() public view {
        BondingCurveMath.BuyQuote memory quote = harness.quoteBuy(_knownBuyState(), 50, 0);

        assertEq(quote.fee, 0);
        assertEq(quote.netUsdcIn, 50);
        assertEq(quote.tokenAmountOut, 200);
    }

    function test_KnownBuyQuoteWithNonZeroFee() public view {
        BondingCurveMath.BuyQuote memory quote = harness.quoteBuy(_knownBuyState(), 100, 250);

        assertEq(quote.fee, 2);
        assertEq(quote.netUsdcIn, 98);
        assertEq(quote.tokenAmountOut, 328);
    }

    function test_KnownSellQuoteWithZeroFee() public view {
        BondingCurveMath.SellQuote memory quote = harness.quoteSell(_knownSellState(), 250, 0, 1000);

        assertEq(quote.fee, 0);
        assertEq(quote.grossUsdcAmountOut, 200);
        assertEq(quote.netUsdcAmountOut, 200);
    }

    function test_KnownSellQuoteWithNonZeroFee() public view {
        BondingCurveMath.SellQuote memory quote = harness.quoteSell(_knownSellState(), 250, 500, 1000);

        assertEq(quote.fee, 10);
        assertEq(quote.grossUsdcAmountOut, 200);
        assertEq(quote.netUsdcAmountOut, 190);
    }

    function test_BuyStateUpdateIsCorrect() public view {
        BondingCurveMath.BuyQuote memory quote = harness.quoteBuy(_knownBuyState(), 100, 250);

        assertEq(quote.nextState.realUsdcReserve, 198);
        assertEq(quote.nextState.realTokenReserve, 172);
        assertEq(quote.nextState.virtualUsdcReserve, 100);
        assertEq(quote.nextState.virtualTokenReserve, 500);
        assertEq(quote.nextState.accruedProtocolFees, 2);
    }

    function test_SellStateUpdateIsCorrect() public view {
        BondingCurveMath.SellQuote memory quote = harness.quoteSell(_knownSellState(), 250, 500, 1000);

        assertEq(quote.nextState.realUsdcReserve, 300);
        assertEq(quote.nextState.realTokenReserve, 450);
        assertEq(quote.nextState.virtualUsdcReserve, 500);
        assertEq(quote.nextState.virtualTokenReserve, 800);
        assertEq(quote.nextState.accruedProtocolFees, 10);
    }

    function test_VirtualReservesRemainUnchanged() public view {
        BondingCurveMath.BuyQuote memory buyQuote = harness.quoteBuy(_knownBuyState(), 50, 0);
        BondingCurveMath.SellQuote memory sellQuote = harness.quoteSell(_knownSellState(), 250, 0, 1000);

        assertEq(buyQuote.nextState.virtualUsdcReserve, _knownBuyState().virtualUsdcReserve);
        assertEq(buyQuote.nextState.virtualTokenReserve, _knownBuyState().virtualTokenReserve);
        assertEq(sellQuote.nextState.virtualUsdcReserve, _knownSellState().virtualUsdcReserve);
        assertEq(sellQuote.nextState.virtualTokenReserve, _knownSellState().virtualTokenReserve);
    }

    function test_ProtocolFeesRemainSeparateFromRealUsdcReserve() public view {
        BondingCurveMath.CurveState memory withoutFees = _knownBuyState();
        BondingCurveMath.CurveState memory withFees = _knownBuyState();
        withFees.accruedProtocolFees = 999;

        BondingCurveMath.BuyQuote memory quoteWithoutFees = harness.quoteBuy(withoutFees, 100, 250);
        BondingCurveMath.BuyQuote memory quoteWithFees = harness.quoteBuy(withFees, 100, 250);

        assertEq(quoteWithoutFees.tokenAmountOut, quoteWithFees.tokenAmountOut);
        assertEq(quoteWithoutFees.netUsdcIn, quoteWithFees.netUsdcIn);
        assertEq(quoteWithoutFees.nextState.realUsdcReserve, quoteWithFees.nextState.realUsdcReserve);
        assertEq(quoteWithFees.nextState.accruedProtocolFees, 1001);
    }

    function test_RevertWhenBuyInputIsZero() public {
        vm.expectRevert(BondingCurveMath.ZeroInput.selector);
        harness.quoteBuy(_knownBuyState(), 0, 0);
    }

    function test_RevertWhenSellInputIsZero() public {
        vm.expectRevert(BondingCurveMath.ZeroInput.selector);
        harness.quoteSell(_knownSellState(), 0, 0, 1000);
    }

    function test_RevertWhenBuyFeeBpsEqualsTenThousand() public {
        vm.expectRevert(BondingCurveMath.InvalidFeeBps.selector);
        harness.quoteBuy(_knownBuyState(), 100, 10_000);
    }

    function test_RevertWhenSellFeeBpsExceedsTenThousand() public {
        vm.expectRevert(BondingCurveMath.InvalidFeeBps.selector);
        harness.quoteSell(_knownSellState(), 250, 10_001, 1000);
    }

    function test_RevertWhenBuyOutputRoundsToZero() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 0,
            realTokenReserve: 1,
            virtualUsdcReserve: 1_000_000,
            virtualTokenReserve: 1,
            accruedProtocolFees: 0
        });

        vm.expectRevert(BondingCurveMath.ZeroOutput.selector);
        harness.quoteBuy(state, 1, 0);
    }

    function test_RevertWhenSellOutputRoundsToZero() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 1,
            realTokenReserve: 1,
            virtualUsdcReserve: 1,
            virtualTokenReserve: 1_000_000,
            accruedProtocolFees: 0
        });

        vm.expectRevert(BondingCurveMath.ZeroOutput.selector);
        harness.quoteSell(state, 1, 0, 10);
    }

    function test_RevertWhenBuyOutputExceedsRealTokenReserve() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 0,
            realTokenReserve: 10,
            virtualUsdcReserve: 100,
            virtualTokenReserve: 1000,
            accruedProtocolFees: 0
        });

        vm.expectRevert(BondingCurveMath.InsufficientRealTokenReserve.selector);
        harness.quoteBuy(state, 100, 0);
    }

    function test_RevertWhenGrossSellOutputExceedsRealUsdcReserve() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 10,
            realTokenReserve: 100,
            virtualUsdcReserve: 1000,
            virtualTokenReserve: 100,
            accruedProtocolFees: 0
        });

        vm.expectRevert(BondingCurveMath.InsufficientRealUsdcReserve.selector);
        harness.quoteSell(state, 200, 0, 1000);
    }

    function test_RevertWhenSellCausesRealTokenReserveToExceedTotalSupply() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 500,
            realTokenReserve: 900,
            virtualUsdcReserve: 500,
            virtualTokenReserve: 100,
            accruedProtocolFees: 0
        });

        vm.expectRevert(BondingCurveMath.TokenReserveExceedsTotalSupply.selector);
        harness.quoteSell(state, 101, 0, 1000);
    }

    function test_CreatorAndPublicBuyCalculationsAreIdenticalForIdenticalInputs() public view {
        BondingCurveMath.BuyQuote memory creatorQuote = harness.quoteBuy(_knownBuyState(), 100, 250);
        BondingCurveMath.BuyQuote memory publicQuote = harness.quoteBuy(_knownBuyState(), 100, 250);

        _assertBuyQuoteEq(creatorQuote, publicQuote);
    }

    function test_QuoteBuyDoesNotMutateItsInputMemoryStateUnexpectedly() public view {
        BondingCurveMath.CurveState memory state = _knownBuyState();
        (BondingCurveMath.CurveState memory originalState, BondingCurveMath.CurveState memory stateAfter,) =
            harness.quoteBuyEchoState(state, 100, 250);

        _assertStateEq(originalState, state);
        _assertStateEq(stateAfter, state);
    }

    function test_QuoteSellDoesNotMutateItsInputMemoryStateUnexpectedly() public view {
        BondingCurveMath.CurveState memory state = _knownSellState();
        (BondingCurveMath.CurveState memory originalState, BondingCurveMath.CurveState memory stateAfter,) =
            harness.quoteSellEchoState(state, 250, 500, 1000);

        _assertStateEq(originalState, state);
        _assertStateEq(stateAfter, state);
    }

    function test_FullPrecisionBuyHandlesIntermediateProductAboveUint256() public view {
        uint256 large = 1 << 200;
        uint256 halfTokenReserve = 1 << 99;
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 0,
            realTokenReserve: halfTokenReserve,
            virtualUsdcReserve: large,
            virtualTokenReserve: halfTokenReserve,
            accruedProtocolFees: 0
        });

        BondingCurveMath.BuyQuote memory quote = harness.quoteBuy(state, large, 0);

        assertEq(quote.tokenAmountOut, halfTokenReserve);
        assertEq(quote.nextState.realTokenReserve, 0);
        assertEq(quote.nextState.realUsdcReserve, large);
    }

    function test_FullPrecisionSellHandlesIntermediateProductAboveUint256() public view {
        uint256 largeTokenAmount = 1 << 200;
        uint256 halfUsdcReserve = 1 << 99;
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: halfUsdcReserve,
            realTokenReserve: 0,
            virtualUsdcReserve: halfUsdcReserve,
            virtualTokenReserve: largeTokenAmount,
            accruedProtocolFees: 0
        });

        BondingCurveMath.SellQuote memory quote = harness.quoteSell(state, largeTokenAmount, 0, largeTokenAmount);

        assertEq(quote.grossUsdcAmountOut, halfUsdcReserve);
        assertEq(quote.netUsdcAmountOut, halfUsdcReserve);
        assertEq(quote.nextState.realUsdcReserve, 0);
    }

    function test_UpwardRoundingBehaviorIsUsedForReserveUpdates() public view {
        BondingCurveMath.CurveState memory buyState = BondingCurveMath.CurveState({
            realUsdcReserve: 0,
            realTokenReserve: 1,
            virtualUsdcReserve: 10,
            virtualTokenReserve: 9,
            accruedProtocolFees: 0
        });
        BondingCurveMath.CurveState memory sellState = BondingCurveMath.CurveState({
            realUsdcReserve: 1,
            realTokenReserve: 0,
            virtualUsdcReserve: 9,
            virtualTokenReserve: 10,
            accruedProtocolFees: 0
        });

        BondingCurveMath.BuyQuote memory buyQuote = harness.quoteBuy(buyState, 2, 0);
        BondingCurveMath.SellQuote memory sellQuote = harness.quoteSell(sellState, 2, 0, 2);

        assertEq(buyQuote.tokenAmountOut, 1);
        assertEq(sellQuote.grossUsdcAmountOut, 1);
    }

    function test_EffectiveReservesOverflowRevertsSafely() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: type(uint256).max,
            realTokenReserve: 1,
            virtualUsdcReserve: 1,
            virtualTokenReserve: 1,
            accruedProtocolFees: 0
        });

        vm.expectRevert(stdError.arithmeticError);
        harness.effectiveReserves(state);
    }

    function test_BuyAdditionOverflowRevertsSafely() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: type(uint256).max - 1,
            realTokenReserve: 2,
            virtualUsdcReserve: 1,
            virtualTokenReserve: 1,
            accruedProtocolFees: 0
        });

        vm.expectRevert(stdError.arithmeticError);
        harness.quoteBuy(state, 1, 0);
    }

    function test_SellAdditionOverflowRevertsSafely() public {
        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: 1,
            realTokenReserve: type(uint256).max,
            virtualUsdcReserve: 1,
            virtualTokenReserve: 1,
            accruedProtocolFees: 0
        });

        vm.expectRevert(stdError.arithmeticError);
        harness.quoteSell(state, 1, 0, type(uint256).max);
    }

    function testFuzz_ValidBuyQuotesRespectInvariants(
        uint256 rawRealUsdcReserve,
        uint256 rawRealTokenReserve,
        uint256 rawVirtualUsdcReserve,
        uint256 rawVirtualTokenReserve,
        uint256 rawAccruedProtocolFees,
        uint256 rawUsdcAmountIn,
        uint256 rawFeeBps
    ) public view {
        uint256 realUsdcReserve = bound(rawRealUsdcReserve, 0, 1_000_000_000_000);
        uint256 realTokenReserve = bound(rawRealTokenReserve, 10 ** 18, 10 ** 27);
        uint256 virtualUsdcReserve = bound(rawVirtualUsdcReserve, 1, 1_000_000_000_000);
        uint256 virtualTokenReserve = bound(rawVirtualTokenReserve, 1, realTokenReserve);
        uint256 effectiveUsdcReserve = realUsdcReserve + virtualUsdcReserve;
        uint256 usdcAmountIn = bound(rawUsdcAmountIn, 1, effectiveUsdcReserve);
        uint256 feeBps = bound(rawFeeBps, 0, 9999);
        uint256 accruedProtocolFees = bound(rawAccruedProtocolFees, 0, 1_000_000_000_000);

        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: realUsdcReserve,
            realTokenReserve: realTokenReserve,
            virtualUsdcReserve: virtualUsdcReserve,
            virtualTokenReserve: virtualTokenReserve,
            accruedProtocolFees: accruedProtocolFees
        });

        BondingCurveMath.BuyQuote memory quote = harness.quoteBuy(state, usdcAmountIn, feeBps);
        uint256 preProduct = effectiveUsdcReserve * (realTokenReserve + virtualTokenReserve);
        uint256 postProduct = (quote.nextState.realUsdcReserve + quote.nextState.virtualUsdcReserve)
            * (quote.nextState.realTokenReserve + quote.nextState.virtualTokenReserve);

        assertLe(quote.fee, usdcAmountIn);
        assertEq(quote.netUsdcIn, usdcAmountIn - quote.fee);
        assertGt(quote.netUsdcIn, 0);
        assertGt(quote.tokenAmountOut, 0);
        assertLe(quote.tokenAmountOut, realTokenReserve);
        assertEq(quote.nextState.realUsdcReserve, realUsdcReserve + quote.netUsdcIn);
        assertEq(quote.nextState.realTokenReserve, realTokenReserve - quote.tokenAmountOut);
        assertEq(quote.nextState.virtualUsdcReserve, virtualUsdcReserve);
        assertEq(quote.nextState.virtualTokenReserve, virtualTokenReserve);
        assertEq(quote.nextState.accruedProtocolFees, accruedProtocolFees + quote.fee);
        assertGe(postProduct, preProduct);
    }

    function testFuzz_ValidSellQuotesRespectInvariants(
        uint256 rawRealUsdcReserve,
        uint256 rawRealTokenReserve,
        uint256 rawVirtualUsdcReserve,
        uint256 rawVirtualTokenReserve,
        uint256 rawAccruedProtocolFees,
        uint256 rawTokenAmountIn,
        uint256 rawFeeBps,
        uint256 rawSupplyHeadroom
    ) public view {
        uint256 realUsdcReserve = bound(rawRealUsdcReserve, 10 ** 18, 10 ** 24);
        uint256 realTokenReserve = bound(rawRealTokenReserve, 0, 10 ** 12);
        uint256 virtualUsdcReserve = bound(rawVirtualUsdcReserve, 1, realUsdcReserve);
        uint256 virtualTokenReserve = bound(rawVirtualTokenReserve, 1, 10 ** 12);
        uint256 effectiveTokenReserve = realTokenReserve + virtualTokenReserve;
        uint256 tokenAmountIn = bound(rawTokenAmountIn, 1, effectiveTokenReserve);
        uint256 feeBps = bound(rawFeeBps, 0, 9999);
        uint256 accruedProtocolFees = bound(rawAccruedProtocolFees, 0, 10 ** 18);
        uint256 totalTokenSupply = realTokenReserve + tokenAmountIn + bound(rawSupplyHeadroom, 0, 10 ** 18);

        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: realUsdcReserve,
            realTokenReserve: realTokenReserve,
            virtualUsdcReserve: virtualUsdcReserve,
            virtualTokenReserve: virtualTokenReserve,
            accruedProtocolFees: accruedProtocolFees
        });

        BondingCurveMath.SellQuote memory quote = harness.quoteSell(state, tokenAmountIn, feeBps, totalTokenSupply);
        uint256 preProduct = (realUsdcReserve + virtualUsdcReserve) * effectiveTokenReserve;
        uint256 postProduct = (quote.nextState.realUsdcReserve + quote.nextState.virtualUsdcReserve)
            * (quote.nextState.realTokenReserve + quote.nextState.virtualTokenReserve);

        assertLe(quote.fee, quote.grossUsdcAmountOut);
        assertGt(quote.grossUsdcAmountOut, 0);
        assertGt(quote.netUsdcAmountOut, 0);
        assertLe(quote.grossUsdcAmountOut, realUsdcReserve);
        assertEq(quote.netUsdcAmountOut, quote.grossUsdcAmountOut - quote.fee);
        assertEq(quote.nextState.realTokenReserve, realTokenReserve + tokenAmountIn);
        assertEq(quote.nextState.realUsdcReserve, realUsdcReserve - quote.grossUsdcAmountOut);
        assertLe(quote.nextState.realTokenReserve, totalTokenSupply);
        assertEq(quote.nextState.virtualUsdcReserve, virtualUsdcReserve);
        assertEq(quote.nextState.virtualTokenReserve, virtualTokenReserve);
        assertEq(quote.nextState.accruedProtocolFees, accruedProtocolFees + quote.fee);
        assertGe(postProduct, preProduct);
    }

    function testFuzz_AccruedFeesDoNotAffectEffectiveReservePricing(
        uint256 rawRealUsdcReserve,
        uint256 rawRealTokenReserve,
        uint256 rawVirtualUsdcReserve,
        uint256 rawVirtualTokenReserve,
        uint256 rawUsdcAmountIn,
        uint256 rawFeeBps,
        uint256 rawAccruedFeesA,
        uint256 rawAccruedFeesB
    ) public view {
        uint256 realUsdcReserve = bound(rawRealUsdcReserve, 0, 1_000_000_000_000);
        uint256 realTokenReserve = bound(rawRealTokenReserve, 10 ** 18, 10 ** 27);
        uint256 virtualUsdcReserve = bound(rawVirtualUsdcReserve, 1, 1_000_000_000_000);
        uint256 virtualTokenReserve = bound(rawVirtualTokenReserve, 1, realTokenReserve);
        uint256 usdcAmountIn = bound(rawUsdcAmountIn, 1, realUsdcReserve + virtualUsdcReserve);
        uint256 feeBps = bound(rawFeeBps, 0, 9999);
        uint256 accruedFeesA = bound(rawAccruedFeesA, 0, 1_000_000_000_000);
        uint256 accruedFeesB = bound(rawAccruedFeesB, 0, 1_000_000_000_000);

        BondingCurveMath.CurveState memory stateA = BondingCurveMath.CurveState({
            realUsdcReserve: realUsdcReserve,
            realTokenReserve: realTokenReserve,
            virtualUsdcReserve: virtualUsdcReserve,
            virtualTokenReserve: virtualTokenReserve,
            accruedProtocolFees: accruedFeesA
        });
        BondingCurveMath.CurveState memory stateB = BondingCurveMath.CurveState({
            realUsdcReserve: realUsdcReserve,
            realTokenReserve: realTokenReserve,
            virtualUsdcReserve: virtualUsdcReserve,
            virtualTokenReserve: virtualTokenReserve,
            accruedProtocolFees: accruedFeesB
        });

        BondingCurveMath.BuyQuote memory quoteA = harness.quoteBuy(stateA, usdcAmountIn, feeBps);
        BondingCurveMath.BuyQuote memory quoteB = harness.quoteBuy(stateB, usdcAmountIn, feeBps);

        assertEq(quoteA.fee, quoteB.fee);
        assertEq(quoteA.netUsdcIn, quoteB.netUsdcIn);
        assertEq(quoteA.tokenAmountOut, quoteB.tokenAmountOut);
        assertEq(quoteA.nextState.realUsdcReserve, quoteB.nextState.realUsdcReserve);
        assertEq(quoteA.nextState.realTokenReserve, quoteB.nextState.realTokenReserve);
    }

    function testFuzz_IdenticalStateAndInputAlwaysReturnIdenticalBuyOutput(
        uint256 rawRealUsdcReserve,
        uint256 rawRealTokenReserve,
        uint256 rawVirtualUsdcReserve,
        uint256 rawVirtualTokenReserve,
        uint256 rawAccruedProtocolFees,
        uint256 rawUsdcAmountIn,
        uint256 rawFeeBps
    ) public view {
        uint256 realUsdcReserve = bound(rawRealUsdcReserve, 0, 1_000_000_000_000);
        uint256 realTokenReserve = bound(rawRealTokenReserve, 10 ** 18, 10 ** 27);
        uint256 virtualUsdcReserve = bound(rawVirtualUsdcReserve, 1, 1_000_000_000_000);
        uint256 virtualTokenReserve = bound(rawVirtualTokenReserve, 1, realTokenReserve);
        uint256 usdcAmountIn = bound(rawUsdcAmountIn, 1, realUsdcReserve + virtualUsdcReserve);
        uint256 feeBps = bound(rawFeeBps, 0, 9999);
        uint256 accruedProtocolFees = bound(rawAccruedProtocolFees, 0, 1_000_000_000_000);

        BondingCurveMath.CurveState memory state = BondingCurveMath.CurveState({
            realUsdcReserve: realUsdcReserve,
            realTokenReserve: realTokenReserve,
            virtualUsdcReserve: virtualUsdcReserve,
            virtualTokenReserve: virtualTokenReserve,
            accruedProtocolFees: accruedProtocolFees
        });

        BondingCurveMath.BuyQuote memory firstQuote = harness.quoteBuy(state, usdcAmountIn, feeBps);
        BondingCurveMath.BuyQuote memory secondQuote = harness.quoteBuy(state, usdcAmountIn, feeBps);

        _assertBuyQuoteEq(firstQuote, secondQuote);
    }

    function _initialState() internal pure returns (BondingCurveMath.CurveState memory) {
        return BondingCurveMath.CurveState({
            realUsdcReserve: 0,
            realTokenReserve: TOTAL_SUPPLY,
            virtualUsdcReserve: 1_000_000,
            virtualTokenReserve: 10 ** 18,
            accruedProtocolFees: 0
        });
    }

    function _knownBuyState() internal pure returns (BondingCurveMath.CurveState memory) {
        return BondingCurveMath.CurveState({
            realUsdcReserve: 100,
            realTokenReserve: 500,
            virtualUsdcReserve: 100,
            virtualTokenReserve: 500,
            accruedProtocolFees: 0
        });
    }

    function _knownSellState() internal pure returns (BondingCurveMath.CurveState memory) {
        return BondingCurveMath.CurveState({
            realUsdcReserve: 500,
            realTokenReserve: 200,
            virtualUsdcReserve: 500,
            virtualTokenReserve: 800,
            accruedProtocolFees: 0
        });
    }

    function _assertBuyQuoteEq(BondingCurveMath.BuyQuote memory left, BondingCurveMath.BuyQuote memory right)
        internal
        pure
    {
        assertEq(left.fee, right.fee);
        assertEq(left.netUsdcIn, right.netUsdcIn);
        assertEq(left.tokenAmountOut, right.tokenAmountOut);
        _assertStateEq(left.nextState, right.nextState);
    }

    function _assertStateEq(BondingCurveMath.CurveState memory left, BondingCurveMath.CurveState memory right)
        internal
        pure
    {
        assertEq(left.realUsdcReserve, right.realUsdcReserve);
        assertEq(left.realTokenReserve, right.realTokenReserve);
        assertEq(left.virtualUsdcReserve, right.virtualUsdcReserve);
        assertEq(left.virtualTokenReserve, right.virtualTokenReserve);
        assertEq(left.accruedProtocolFees, right.accruedProtocolFees);
    }
}
