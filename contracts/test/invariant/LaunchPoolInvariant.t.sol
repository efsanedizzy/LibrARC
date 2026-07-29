// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";

import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { LaunchPool } from "../../src/LaunchPool.sol";
import { LibrARCToken } from "../../src/LibrARCToken.sol";
import { BondingCurveMath } from "../../src/libraries/BondingCurveMath.sol";
import { MockLiquidityAdapter } from "../mocks/MockLiquidityAdapter.sol";
import { LaunchPoolHandler } from "./LaunchPoolHandler.t.sol";

contract LaunchPoolInvariant is StdInvariant, Test {
    uint8 internal constant STATUS_ACTIVE = 1;
    uint8 internal constant STATUS_GRADUATION_PENDING = 2;
    uint8 internal constant STATUS_GRADUATED = 3;

    LaunchPoolHandler internal handler;
    LaunchPool internal pool;
    LaunchFactory internal factory;
    LibrARCToken internal token;
    IERC20 internal quoteAsset;
    MockLiquidityAdapter internal liquidityAdapter;

    function setUp() public {
        handler = new LaunchPoolHandler();
        pool = handler.getPool();
        factory = handler.getFactory();
        token = handler.getToken();
        quoteAsset = handler.getQuoteAsset();
        liquidityAdapter = handler.getLiquidityAdapter();

        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = LaunchPoolHandler.buy.selector;
        selectors[1] = LaunchPoolHandler.sell.selector;
        selectors[2] = LaunchPoolHandler.donateQuoteAsset.selector;
        selectors[3] = LaunchPoolHandler.donateLaunchToken.selector;
        selectors[4] = LaunchPoolHandler.sweepProtocolFees.selector;
        selectors[5] = LaunchPoolHandler.pauseBuys.selector;
        selectors[6] = LaunchPoolHandler.unpauseBuys.selector;
        selectors[7] = LaunchPoolHandler.pauseAllTrading.selector;
        selectors[8] = LaunchPoolHandler.unpauseAllTrading.selector;

        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));

        bytes4[] memory graduationSelector = new bytes4[](1);
        graduationSelector[0] = LaunchPoolHandler.graduate.selector;
        targetSelector(FuzzSelector({ addr: address(handler), selectors: graduationSelector }));
    }

    function invariant_TokenSupplyAlwaysMatchesFixedSupply() external view {
        assertEq(token.totalSupply(), token.FIXED_SUPPLY());
    }

    function invariant_InternalReservesMatchGhostAccounting() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertEq(state.realUsdcReserve, handler.expectedRealUsdcReserve());
        assertEq(state.realTokenReserve, handler.expectedRealTokenReserve());
        assertEq(state.accruedProtocolFees, handler.expectedAccruedProtocolFees());
    }

    function invariant_FeeConservationMatchesAccrualAndSweeps() external view {
        assertEq(
            handler.expectedAccruedProtocolFees() + handler.totalProtocolFeesSwept(),
            handler.totalBuyFeesAccrued() + handler.totalSellFeesAccrued()
        );
    }

    function invariant_RealReserveBoundsAndVirtualReserveStabilityHold() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertLe(state.realTokenReserve, pool.totalTokenSupply());
        assertLe(state.realUsdcReserve, pool.graduationThreshold());
        assertEq(state.virtualUsdcReserve, pool.virtualUsdcReserve());
        assertEq(state.virtualTokenReserve, pool.virtualTokenReserve());
    }

    function invariant_ActualBalancesAlwaysCoverAccountedReserves() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertGe(
            quoteAsset.balanceOf(address(pool)), state.realUsdcReserve + state.accruedProtocolFees
        );
        assertGe(token.balanceOf(address(pool)), state.realTokenReserve);
    }

    function invariant_StandardMockBalancesMatchExactComposition() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertEq(
            quoteAsset.balanceOf(address(pool)),
            state.realUsdcReserve + state.accruedProtocolFees + handler.totalQuoteDonations()
        );
        assertEq(
            token.balanceOf(address(pool)), state.realTokenReserve + handler.totalTokenDonations()
        );
    }

    function invariant_FeeVaultBalanceMatchesSweptProtocolFees() external view {
        assertEq(
            quoteAsset.balanceOf(address(handler.getFeeVault())), handler.totalProtocolFeesSwept()
        );
    }

    function invariant_DonationsRemainIsolatedFromAccountingAndLifecycle() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertFalse(handler.donationAccountingViolation());
        assertEq(
            quoteAsset.balanceOf(address(pool))
                - (state.realUsdcReserve + state.accruedProtocolFees),
            handler.totalQuoteDonations()
        );
        assertEq(
            token.balanceOf(address(pool)) - state.realTokenReserve, handler.totalTokenDonations()
        );

        if (uint8(pool.status()) == STATUS_GRADUATION_PENDING) {
            assertEq(state.realUsdcReserve, pool.graduationThreshold());
        }
    }

    function invariant_PauseIsolationAndViewSemanticsHold() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();
        uint8 status = uint8(pool.status());

        assertFalse(handler.pauseAccountingViolation());
        assertEq(
            pool.canBuy(), status == STATUS_ACTIVE && !pool.buysPaused() && !pool.allTradingPaused()
        );
        assertEq(pool.canSell(), status == STATUS_ACTIVE && !pool.allTradingPaused());

        // Pauses must never rewrite reserves, so current state must still match ghost accounting.
        assertEq(state.realUsdcReserve, handler.expectedRealUsdcReserve());
        assertEq(state.realTokenReserve, handler.expectedRealTokenReserve());
        assertEq(state.accruedProtocolFees, handler.expectedAccruedProtocolFees());
    }

    function invariant_StatusNeverRegressesAndGraduationIsSingleUse() external view {
        assertFalse(handler.statusRegressionDetected());
        assertLe(handler.successfulGraduationCount(), 1);
        assertLe(uint256(handler.highestObservedPoolStatus()), uint256(STATUS_GRADUATED));
    }

    function invariant_GraduationStateRemainsSound() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();
        uint8 status = uint8(pool.status());

        if (status == STATUS_GRADUATED) {
            assertEq(state.realUsdcReserve, 0);
            assertEq(state.realTokenReserve, 0);
            assertFalse(pool.canBuy());
            assertFalse(pool.canSell());
            assertEq(liquidityAdapter.migrationCount(), 1);
            assertTrue(handler.lastSuccessfulMigrationId() != bytes32(0));
            assertEq(liquidityAdapter.lastQuoteAssetAmount(), handler.migratedRealUsdcReserve());
            assertEq(liquidityAdapter.lastLaunchTokenAmount(), handler.migratedRealTokenReserve());
            assertEq(
                quoteAsset.balanceOf(address(liquidityAdapter)), handler.migratedRealUsdcReserve()
            );
            assertEq(token.balanceOf(address(liquidityAdapter)), handler.migratedRealTokenReserve());
            assertEq(pool.launchToken().allowance(address(pool), address(liquidityAdapter)), 0);
            assertEq(pool.quoteAsset().allowance(address(pool), address(liquidityAdapter)), 0);
        }

        if (status == STATUS_GRADUATION_PENDING) {
            assertEq(state.realUsdcReserve, pool.graduationThreshold());
            assertFalse(pool.canBuy());
            assertFalse(pool.canSell());
        }
    }

    function invariant_GraduationThresholdAndCapacityRulesHold() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();
        uint8 status = uint8(pool.status());

        assertLe(state.realUsdcReserve, pool.graduationThreshold());

        if (status == STATUS_ACTIVE) {
            assertLt(state.realUsdcReserve, pool.graduationThreshold());
        } else if (status == STATUS_GRADUATION_PENDING) {
            assertEq(state.realUsdcReserve, pool.graduationThreshold());
        }
    }

    function invariant_FeeSweepIsolationFlagsAndBalancesHold() external view {
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertFalse(handler.feeSweepAccountingViolation());
        assertEq(
            quoteAsset.balanceOf(address(handler.getFeeVault())), handler.totalProtocolFeesSwept()
        );
        assertGe(quoteAsset.balanceOf(address(pool)), state.realUsdcReserve);
    }

    function invariant_AllowancesAreCleanOutsideActiveCalls() external view {
        assertEq(pool.launchToken().allowance(address(pool), address(liquidityAdapter)), 0);
        assertEq(pool.quoteAsset().allowance(address(pool), address(liquidityAdapter)), 0);
        assertEq(quoteAsset.allowance(address(factory), address(pool)), 0);
    }

    function invariant_FactoryCustodyRemainsClean() external view {
        assertEq(token.balanceOf(address(factory)), 0);
        assertEq(quoteAsset.balanceOf(address(factory)), handler.factoryAccidentalQuoteDonation());
        assertEq(quoteAsset.allowance(address(factory), address(pool)), 0);
    }

    function invariant_RepeatedQuotesRemainDeterministicForIdenticalState() external view {
        if (uint8(pool.status()) != STATUS_ACTIVE) {
            return;
        }

        uint256 buyProbeAmount = _currentValidBuyProbe();
        if (buyProbeAmount != 0) {
            (BondingCurveMath.BuyQuote memory firstBuyQuote, bool firstBuyReaches) =
                pool.quoteBuy(buyProbeAmount);
            (BondingCurveMath.BuyQuote memory secondBuyQuote, bool secondBuyReaches) =
                pool.quoteBuy(buyProbeAmount);

            assertEq(
                keccak256(abi.encode(firstBuyQuote, firstBuyReaches)),
                keccak256(abi.encode(secondBuyQuote, secondBuyReaches))
            );
        }

        uint256 sellProbeAmount = _currentValidSellProbe();
        if (sellProbeAmount != 0) {
            BondingCurveMath.SellQuote memory firstSellQuote = pool.quoteSell(sellProbeAmount);
            BondingCurveMath.SellQuote memory secondSellQuote = pool.quoteSell(sellProbeAmount);

            assertEq(keccak256(abi.encode(firstSellQuote)), keccak256(abi.encode(secondSellQuote)));
        }
    }

    function invariant_AllViolationFlagsRemainFalse() external view {
        assertFalse(handler.statusRegressionDetected());
        assertFalse(handler.donationAccountingViolation());
        assertFalse(handler.pauseAccountingViolation());
        assertFalse(handler.feeSweepAccountingViolation());
    }

    function _currentValidBuyProbe() internal view returns (uint256 probeAmount) {
        uint256 remainingCapacity = pool.remainingGraduationCapacity();
        if (remainingCapacity == 0) {
            return 0;
        }

        uint256[4] memory candidates =
            [_min(remainingCapacity, uint256(10_000)), uint256(1000), uint256(100), uint256(1)];

        for (uint256 i = 0; i < candidates.length; ++i) {
            if (candidates[i] == 0) {
                continue;
            }

            try pool.quoteBuy(candidates[i]) returns (BondingCurveMath.BuyQuote memory, bool) {
                return candidates[i];
            } catch { }
        }
    }

    function _currentValidSellProbe() internal view returns (uint256 probeAmount) {
        uint256[7] memory candidates = [
            uint256(1 ether),
            uint256(10 ether),
            100 ether,
            1000 ether,
            10_000 ether,
            100_000 ether,
            1_000_000 ether
        ];

        for (uint256 i = 0; i < candidates.length; ++i) {
            try pool.quoteSell(candidates[i]) returns (BondingCurveMath.SellQuote memory) {
                return candidates[i];
            } catch { }
        }
    }

    function _min(uint256 left, uint256 right) internal pure returns (uint256) {
        return Math.min(left, right);
    }
}
