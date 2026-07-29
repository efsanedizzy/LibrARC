// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Test } from "forge-std/Test.sol";

import { FeeVault } from "../../src/FeeVault.sol";
import { LaunchFactory } from "../../src/LaunchFactory.sol";
import { LaunchPool } from "../../src/LaunchPool.sol";
import { LibrARCToken } from "../../src/LibrARCToken.sol";
import { BondingCurveMath } from "../../src/libraries/BondingCurveMath.sol";
import { MockLiquidityAdapter } from "../mocks/MockLiquidityAdapter.sol";

contract InvariantQuoteAsset is ERC20 {
    constructor() ERC20("Arc USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Stateful invariant handler for randomized LaunchPool activity.
/// @dev Ghost accounting is updated only after successful protocol actions.
contract LaunchPoolHandler is Test {
    uint256 internal constant TEST_VIRTUAL_USDC_RESERVE = 1_000_000;
    uint256 internal constant TEST_VIRTUAL_TOKEN_RESERVE = 500_000_000 * 10 ** 18;
    uint256 internal constant TEST_BUY_FEE_BPS = 250;
    uint256 internal constant TEST_SELL_FEE_BPS = 300;
    uint256 internal constant TEST_GRADUATION_THRESHOLD = 120_000;
    uint256 internal constant TEST_MAX_METADATA_URI_LENGTH = 120;
    uint256 internal constant TEST_INITIAL_TRADER_USDC = 500_000;
    uint256 internal constant TEST_MAX_BUY_GROSS_USDC = 50_000;
    uint256 internal constant TEST_MAX_QUOTE_DONATION = 20_000;
    uint256 internal constant TEST_FACTORY_QUOTE_DONATION = 33_333;

    uint8 internal constant STATUS_UNINITIALIZED = 0;
    uint8 internal constant STATUS_ACTIVE = 1;
    uint8 internal constant STATUS_GRADUATION_PENDING = 2;
    uint8 internal constant STATUS_GRADUATED = 3;

    address public constant ALICE = address(0xA11CE);
    address public constant BOB = address(0xB0B);
    address public constant CAROL = address(0xCA401);
    address public constant LIQUIDITY_RECIPIENT = address(0xF00D);

    InvariantQuoteAsset public quoteAsset;
    FeeVault public feeVault;
    MockLiquidityAdapter public liquidityAdapter;
    LaunchFactory public factory;
    LibrARCToken public token;
    LaunchPool public pool;

    uint256 public expectedRealUsdcReserve;
    uint256 public expectedRealTokenReserve;
    uint256 public expectedAccruedProtocolFees;
    uint256 public totalBuyFeesAccrued;
    uint256 public totalSellFeesAccrued;
    uint256 public totalProtocolFeesSwept;
    uint256 public totalQuoteDonations;
    uint256 public totalTokenDonations;
    uint256 public migratedRealUsdcReserve;
    uint256 public migratedRealTokenReserve;
    uint8 public highestObservedPoolStatus;
    bool public statusRegressionDetected;
    bool public donationAccountingViolation;
    bool public pauseAccountingViolation;
    bool public feeSweepAccountingViolation;
    uint256 public successfulBuyCount;
    uint256 public successfulSellCount;
    uint256 public successfulSweepCount;
    uint256 public successfulGraduationCount;
    bytes32 public lastSuccessfulMigrationId;

    address[3] internal _actors;

    struct QuoteSnapshot {
        bool valid;
        bytes data;
    }

    struct StateSnapshot {
        BondingCurveMath.CurveState curveState;
        uint256 poolQuoteBalance;
        uint256 poolTokenBalance;
        uint256 remainingGraduationCapacity;
        uint8 status;
        bool buysPaused;
        bool allTradingPaused;
        QuoteSnapshot buyQuote;
        QuoteSnapshot sellQuote;
    }

    constructor() {
        _actors = [ALICE, BOB, CAROL];

        quoteAsset = new InvariantQuoteAsset();
        feeVault = new FeeVault(address(this), address(this), 1);
        liquidityAdapter = new MockLiquidityAdapter();
        factory = new LaunchFactory(
            address(this),
            1,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            TEST_VIRTUAL_USDC_RESERVE,
            TEST_VIRTUAL_TOKEN_RESERVE,
            TEST_BUY_FEE_BPS,
            TEST_SELL_FEE_BPS,
            TEST_GRADUATION_THRESHOLD,
            TEST_MAX_METADATA_URI_LENGTH
        );

        (address tokenAddress, address poolAddress,) =
            factory.createLaunch("Invariant Launch", "IVT", "ipfs://librarc/invariant");

        token = LibrARCToken(tokenAddress);
        pool = LaunchPool(payable(poolAddress));

        for (uint256 i = 0; i < _actors.length; ++i) {
            quoteAsset.mint(_actors[i], TEST_INITIAL_TRADER_USDC);
        }

        // Keep an accidental factory donation in place and verify later that pool activity never consumes it.
        quoteAsset.mint(address(factory), TEST_FACTORY_QUOTE_DONATION);

        BondingCurveMath.CurveState memory initialState = pool.curveState();
        expectedRealUsdcReserve = initialState.realUsdcReserve;
        expectedRealTokenReserve = initialState.realTokenReserve;
        expectedAccruedProtocolFees = initialState.accruedProtocolFees;
        highestObservedPoolStatus = uint8(pool.status());
    }

    function buy(uint256 actorSeed, uint256 amountSeed) external {
        if (!pool.canBuy()) {
            _observeStatus();
            return;
        }

        address actor = _actor(actorSeed);
        uint256 actorBalance = quoteAsset.balanceOf(actor);
        uint256 remainingCapacity = pool.remainingGraduationCapacity();
        uint256 maxGrossAmount =
            _min(actorBalance, _min(remainingCapacity, TEST_MAX_BUY_GROSS_USDC));

        if (maxGrossAmount == 0) {
            _observeStatus();
            return;
        }

        (uint256 usdcAmountIn, BondingCurveMath.BuyQuote memory quote) =
            _pickValidBuy(actorBalance, maxGrossAmount, amountSeed);
        if (usdcAmountIn == 0) {
            _observeStatus();
            return;
        }

        uint256 actorTokenBefore = token.balanceOf(actor);
        uint256 poolQuoteBefore = quoteAsset.balanceOf(address(pool));

        vm.startPrank(actor);
        quoteAsset.approve(address(pool), usdcAmountIn);

        try pool.buy(usdcAmountIn, quote.tokenAmountOut, block.timestamp + 1 days, actor) returns (
            uint256 amountOut
        ) {
            assertEq(amountOut, quote.tokenAmountOut);
            assertEq(token.balanceOf(actor), actorTokenBefore + amountOut);
            assertEq(quoteAsset.balanceOf(address(pool)), poolQuoteBefore + usdcAmountIn);

            expectedRealUsdcReserve = quote.nextState.realUsdcReserve;
            expectedRealTokenReserve = quote.nextState.realTokenReserve;
            expectedAccruedProtocolFees = quote.nextState.accruedProtocolFees;
            totalBuyFeesAccrued += quote.fee;
            successfulBuyCount += 1;
        } catch {
            quoteAsset.approve(address(pool), 0);
        }
        vm.stopPrank();

        _observeStatus();
    }

    function sell(uint256 actorSeed, uint256 amountSeed) external {
        if (!pool.canSell()) {
            _observeStatus();
            return;
        }

        address actor = _actor(actorSeed);
        uint256 actorBalance = token.balanceOf(actor);
        if (actorBalance == 0) {
            _observeStatus();
            return;
        }

        (uint256 tokenAmountIn, BondingCurveMath.SellQuote memory quote) =
            _pickValidSell(actorBalance, amountSeed);
        if (tokenAmountIn == 0) {
            _observeStatus();
            return;
        }

        uint256 actorQuoteBefore = quoteAsset.balanceOf(actor);
        uint256 poolTokenBefore = token.balanceOf(address(pool));

        vm.startPrank(actor);
        token.approve(address(pool), tokenAmountIn);

        try pool.sell(
            tokenAmountIn, quote.netUsdcAmountOut, block.timestamp + 1 days, actor
        ) returns (
            uint256 amountOut
        ) {
            assertEq(amountOut, quote.netUsdcAmountOut);
            assertEq(quoteAsset.balanceOf(actor), actorQuoteBefore + amountOut);
            assertEq(token.balanceOf(address(pool)), poolTokenBefore + tokenAmountIn);

            expectedRealUsdcReserve = quote.nextState.realUsdcReserve;
            expectedRealTokenReserve = quote.nextState.realTokenReserve;
            expectedAccruedProtocolFees = quote.nextState.accruedProtocolFees;
            totalSellFeesAccrued += quote.fee;
            successfulSellCount += 1;
        } catch {
            token.approve(address(pool), 0);
        }
        vm.stopPrank();

        _observeStatus();
    }

    function donateQuoteAsset(uint256 actorSeed, uint256 amountSeed) external {
        address actor = _actor(actorSeed);
        uint256 actorBalance = quoteAsset.balanceOf(actor);
        uint256 donationAmount = _min(actorBalance, TEST_MAX_QUOTE_DONATION);
        if (donationAmount == 0) {
            _observeStatus();
            return;
        }

        donationAmount = bound(amountSeed, 1, donationAmount);
        StateSnapshot memory beforeSnapshot = _captureStateSnapshot();

        vm.prank(actor);
        bool success = quoteAsset.transfer(address(pool), donationAmount);
        assertTrue(success);

        StateSnapshot memory afterSnapshot = _captureStateSnapshot();
        totalQuoteDonations += donationAmount;

        if (!_stateCoreMatches(beforeSnapshot, afterSnapshot)) {
            donationAccountingViolation = true;
        }
        if (afterSnapshot.poolQuoteBalance != beforeSnapshot.poolQuoteBalance + donationAmount) {
            donationAccountingViolation = true;
        }
        if (afterSnapshot.poolTokenBalance != beforeSnapshot.poolTokenBalance) {
            donationAccountingViolation = true;
        }

        _observeStatus();
    }

    function donateLaunchToken(uint256 actorSeed, uint256 amountSeed) external {
        address actor = _actor(actorSeed);
        uint256 actorBalance = token.balanceOf(actor);
        if (actorBalance == 0) {
            _observeStatus();
            return;
        }

        uint256 donationAmount = bound(amountSeed, 1, actorBalance);
        StateSnapshot memory beforeSnapshot = _captureStateSnapshot();

        vm.prank(actor);
        bool success = token.transfer(address(pool), donationAmount);
        assertTrue(success);

        StateSnapshot memory afterSnapshot = _captureStateSnapshot();
        totalTokenDonations += donationAmount;

        if (!_stateCoreMatches(beforeSnapshot, afterSnapshot)) {
            donationAccountingViolation = true;
        }
        if (afterSnapshot.poolTokenBalance != beforeSnapshot.poolTokenBalance + donationAmount) {
            donationAccountingViolation = true;
        }
        if (afterSnapshot.poolQuoteBalance != beforeSnapshot.poolQuoteBalance) {
            donationAccountingViolation = true;
        }

        _observeStatus();
    }

    function sweepProtocolFees(uint256 callerSeed) external {
        if (uint8(pool.status()) == STATUS_UNINITIALIZED || expectedAccruedProtocolFees == 0) {
            _observeStatus();
            return;
        }

        address caller = _actor(callerSeed);
        uint256 callerQuoteBefore = quoteAsset.balanceOf(caller);
        uint256 feeVaultQuoteBefore = quoteAsset.balanceOf(address(feeVault));
        StateSnapshot memory beforeSnapshot = _captureStateSnapshot();

        vm.prank(caller);
        try pool.sweepProtocolFees() returns (uint256 amountSwept) {
            assertEq(amountSwept, beforeSnapshot.curveState.accruedProtocolFees);
            assertEq(quoteAsset.balanceOf(caller), callerQuoteBefore);
            assertEq(quoteAsset.balanceOf(address(feeVault)), feeVaultQuoteBefore + amountSwept);

            expectedAccruedProtocolFees = 0;
            totalProtocolFeesSwept += amountSwept;
            successfulSweepCount += 1;

            StateSnapshot memory afterSnapshot = _captureStateSnapshot();
            if (
                afterSnapshot.curveState.realUsdcReserve
                        != beforeSnapshot.curveState.realUsdcReserve
                    || afterSnapshot.curveState.realTokenReserve
                        != beforeSnapshot.curveState.realTokenReserve
                    || afterSnapshot.curveState.virtualUsdcReserve
                        != beforeSnapshot.curveState.virtualUsdcReserve
                    || afterSnapshot.curveState.virtualTokenReserve
                        != beforeSnapshot.curveState.virtualTokenReserve
                    || afterSnapshot.curveState.accruedProtocolFees != 0
                    || afterSnapshot.remainingGraduationCapacity
                        != beforeSnapshot.remainingGraduationCapacity
                    || afterSnapshot.status != beforeSnapshot.status
                    || afterSnapshot.buysPaused != beforeSnapshot.buysPaused
                    || afterSnapshot.allTradingPaused != beforeSnapshot.allTradingPaused
                    || !_samePricingRelevantBuyQuote(
                        afterSnapshot.buyQuote, beforeSnapshot.buyQuote
                    )
                    || !_samePricingRelevantSellQuote(
                            afterSnapshot.sellQuote, beforeSnapshot.sellQuote
                        )
                    || afterSnapshot.poolQuoteBalance
                        != beforeSnapshot.poolQuoteBalance - amountSwept
                    || afterSnapshot.poolTokenBalance != beforeSnapshot.poolTokenBalance
            ) {
                feeSweepAccountingViolation = true;
            }
        } catch { }

        _observeStatus();
    }

    function pauseBuys() external {
        if (uint8(pool.status()) != STATUS_ACTIVE || pool.buysPaused()) {
            _observeStatus();
            return;
        }

        StateSnapshot memory beforeSnapshot = _captureStateSnapshot();

        try factory.pausePoolBuys(address(pool)) {
            StateSnapshot memory afterSnapshot = _captureStateSnapshot();
            if (
                !_pauseActionPreservedAccounting(beforeSnapshot, afterSnapshot)
                    || afterSnapshot.buysPaused != true
                    || afterSnapshot.allTradingPaused != beforeSnapshot.allTradingPaused
            ) {
                pauseAccountingViolation = true;
            }
        } catch { }

        _observeStatus();
    }

    function unpauseBuys() external {
        if (uint8(pool.status()) != STATUS_ACTIVE || !pool.buysPaused()) {
            _observeStatus();
            return;
        }

        StateSnapshot memory beforeSnapshot = _captureStateSnapshot();

        try factory.unpausePoolBuys(address(pool)) {
            StateSnapshot memory afterSnapshot = _captureStateSnapshot();
            if (
                !_pauseActionPreservedAccounting(beforeSnapshot, afterSnapshot)
                    || afterSnapshot.buysPaused != false
                    || afterSnapshot.allTradingPaused != beforeSnapshot.allTradingPaused
            ) {
                pauseAccountingViolation = true;
            }
        } catch { }

        _observeStatus();
    }

    function pauseAllTrading() external {
        if (uint8(pool.status()) != STATUS_ACTIVE || pool.allTradingPaused()) {
            _observeStatus();
            return;
        }

        StateSnapshot memory beforeSnapshot = _captureStateSnapshot();

        try factory.pausePoolTrading(address(pool)) {
            StateSnapshot memory afterSnapshot = _captureStateSnapshot();
            if (
                !_pauseActionPreservedAccounting(beforeSnapshot, afterSnapshot)
                    || afterSnapshot.allTradingPaused != true
                    || afterSnapshot.buysPaused != beforeSnapshot.buysPaused
            ) {
                pauseAccountingViolation = true;
            }
        } catch { }

        _observeStatus();
    }

    function unpauseAllTrading() external {
        if (uint8(pool.status()) != STATUS_ACTIVE || !pool.allTradingPaused()) {
            _observeStatus();
            return;
        }

        StateSnapshot memory beforeSnapshot = _captureStateSnapshot();

        try factory.unpausePoolTrading(address(pool)) {
            StateSnapshot memory afterSnapshot = _captureStateSnapshot();
            if (
                !_pauseActionPreservedAccounting(beforeSnapshot, afterSnapshot)
                    || afterSnapshot.allTradingPaused != false
                    || afterSnapshot.buysPaused != beforeSnapshot.buysPaused
            ) {
                pauseAccountingViolation = true;
            }
        } catch { }

        _observeStatus();
    }

    function graduate(uint256 callerSeed) external {
        if (uint8(pool.status()) != STATUS_GRADUATION_PENDING) {
            _observeStatus();
            return;
        }

        address caller = _actor(callerSeed);
        uint256 callerQuoteBefore = quoteAsset.balanceOf(caller);
        uint256 callerTokenBefore = token.balanceOf(caller);
        BondingCurveMath.CurveState memory beforeState = pool.curveState();

        vm.prank(caller);
        try pool.graduate() returns (bytes32 migrationId) {
            assertTrue(migrationId != bytes32(0));
            assertEq(quoteAsset.balanceOf(caller), callerQuoteBefore);
            assertEq(token.balanceOf(caller), callerTokenBefore);

            lastSuccessfulMigrationId = migrationId;
            migratedRealUsdcReserve = beforeState.realUsdcReserve;
            migratedRealTokenReserve = beforeState.realTokenReserve;
            expectedRealUsdcReserve = 0;
            expectedRealTokenReserve = 0;
            successfulGraduationCount += 1;
        } catch { }

        _observeStatus();
    }

    function getPool() external view returns (LaunchPool) {
        return pool;
    }

    function getFactory() external view returns (LaunchFactory) {
        return factory;
    }

    function getToken() external view returns (LibrARCToken) {
        return token;
    }

    function getQuoteAsset() external view returns (IERC20) {
        return IERC20(address(quoteAsset));
    }

    function getFeeVault() external view returns (FeeVault) {
        return feeVault;
    }

    function getLiquidityAdapter() external view returns (MockLiquidityAdapter) {
        return liquidityAdapter;
    }

    function actorAt(uint256 index) external view returns (address) {
        return _actors[index];
    }

    function actorCount() external pure returns (uint256) {
        return 3;
    }

    function factoryAccidentalQuoteDonation() external pure returns (uint256) {
        return TEST_FACTORY_QUOTE_DONATION;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return _actors[seed % _actors.length];
    }

    function _pickValidBuy(uint256 actorBalance, uint256 maxGrossAmount, uint256 amountSeed)
        internal
        view
        returns (uint256 usdcAmountIn, BondingCurveMath.BuyQuote memory quote)
    {
        uint256[8] memory candidates = [
            maxGrossAmount,
            maxGrossAmount / 2,
            maxGrossAmount / 4,
            maxGrossAmount / 8,
            uint256(10_000),
            uint256(1000),
            uint256(100),
            uint256(1)
        ];

        uint256 start = amountSeed % candidates.length;
        for (uint256 i = 0; i < candidates.length; ++i) {
            uint256 candidate = candidates[(start + i) % candidates.length];
            candidate = _min(candidate, _min(actorBalance, maxGrossAmount));
            if (candidate == 0) {
                continue;
            }

            try pool.quoteBuy(candidate) returns (BondingCurveMath.BuyQuote memory buyQuote, bool) {
                return (candidate, buyQuote);
            } catch { }
        }
    }

    function _pickValidSell(uint256 actorBalance, uint256 amountSeed)
        internal
        view
        returns (uint256 tokenAmountIn, BondingCurveMath.SellQuote memory quote)
    {
        uint256[10] memory candidates = [
            actorBalance,
            actorBalance / 2,
            actorBalance / 4,
            actorBalance / 8,
            actorBalance / 16,
            actorBalance / 32,
            uint256(1_000_000 ether),
            uint256(10_000 ether),
            uint256(100 ether),
            uint256(1 ether)
        ];

        uint256 start = amountSeed % candidates.length;
        for (uint256 i = 0; i < candidates.length; ++i) {
            uint256 candidate = candidates[(start + i) % candidates.length];
            candidate = _min(candidate, actorBalance);
            if (candidate == 0) {
                continue;
            }

            try pool.quoteSell(candidate) returns (BondingCurveMath.SellQuote memory sellQuote) {
                return (candidate, sellQuote);
            } catch { }
        }
    }

    function _captureStateSnapshot() internal view returns (StateSnapshot memory snapshot) {
        snapshot.curveState = pool.curveState();
        snapshot.poolQuoteBalance = quoteAsset.balanceOf(address(pool));
        snapshot.poolTokenBalance = token.balanceOf(address(pool));
        snapshot.remainingGraduationCapacity = pool.remainingGraduationCapacity();
        snapshot.status = uint8(pool.status());
        snapshot.buysPaused = pool.buysPaused();
        snapshot.allTradingPaused = pool.allTradingPaused();
        snapshot.buyQuote = _captureBuyQuoteSnapshot();
        snapshot.sellQuote = _captureSellQuoteSnapshot();
    }

    function _captureBuyQuoteSnapshot() internal view returns (QuoteSnapshot memory snapshot) {
        if (uint8(pool.status()) != STATUS_ACTIVE) {
            return snapshot;
        }

        uint256 remainingCapacity = pool.remainingGraduationCapacity();
        if (remainingCapacity == 0) {
            return snapshot;
        }

        uint256 probeAmount = _min(remainingCapacity, uint256(10_000));
        if (probeAmount == 0) {
            return snapshot;
        }

        try pool.quoteBuy(probeAmount) returns (
            BondingCurveMath.BuyQuote memory quote, bool reaches
        ) {
            snapshot.valid = true;
            snapshot.data = abi.encode(quote, reaches);
        } catch { }
    }

    function _captureSellQuoteSnapshot() internal view returns (QuoteSnapshot memory snapshot) {
        if (uint8(pool.status()) != STATUS_ACTIVE) {
            return snapshot;
        }

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
            try pool.quoteSell(candidates[i]) returns (BondingCurveMath.SellQuote memory quote) {
                snapshot.valid = true;
                snapshot.data = abi.encode(quote);
                return snapshot;
            } catch { }
        }
    }

    function _sameQuote(QuoteSnapshot memory left, QuoteSnapshot memory right)
        internal
        pure
        returns (bool)
    {
        if (left.valid != right.valid) {
            return false;
        }

        if (!left.valid) {
            return true;
        }

        return keccak256(left.data) == keccak256(right.data);
    }

    function _samePricingRelevantBuyQuote(QuoteSnapshot memory left, QuoteSnapshot memory right)
        internal
        pure
        returns (bool)
    {
        if (left.valid != right.valid) {
            return false;
        }

        if (!left.valid) {
            return true;
        }

        (BondingCurveMath.BuyQuote memory leftQuote, bool leftReaches) =
            abi.decode(left.data, (BondingCurveMath.BuyQuote, bool));
        (BondingCurveMath.BuyQuote memory rightQuote, bool rightReaches) =
            abi.decode(right.data, (BondingCurveMath.BuyQuote, bool));

        return leftQuote.fee == rightQuote.fee && leftQuote.netUsdcIn == rightQuote.netUsdcIn
            && leftQuote.tokenAmountOut == rightQuote.tokenAmountOut
            && leftQuote.nextState.realUsdcReserve == rightQuote.nextState.realUsdcReserve
            && leftQuote.nextState.realTokenReserve == rightQuote.nextState.realTokenReserve
            && leftQuote.nextState.virtualUsdcReserve == rightQuote.nextState.virtualUsdcReserve
            && leftQuote.nextState.virtualTokenReserve == rightQuote.nextState.virtualTokenReserve
            && leftReaches == rightReaches;
    }

    function _samePricingRelevantSellQuote(QuoteSnapshot memory left, QuoteSnapshot memory right)
        internal
        pure
        returns (bool)
    {
        if (left.valid != right.valid) {
            return false;
        }

        if (!left.valid) {
            return true;
        }

        BondingCurveMath.SellQuote memory leftQuote =
            abi.decode(left.data, (BondingCurveMath.SellQuote));
        BondingCurveMath.SellQuote memory rightQuote =
            abi.decode(right.data, (BondingCurveMath.SellQuote));

        return leftQuote.fee == rightQuote.fee
            && leftQuote.netUsdcAmountOut == rightQuote.netUsdcAmountOut
            && leftQuote.nextState.realUsdcReserve == rightQuote.nextState.realUsdcReserve
            && leftQuote.nextState.realTokenReserve == rightQuote.nextState.realTokenReserve
            && leftQuote.nextState.virtualUsdcReserve == rightQuote.nextState.virtualUsdcReserve
            && leftQuote.nextState.virtualTokenReserve == rightQuote.nextState.virtualTokenReserve;
    }

    function _stateCoreMatches(
        StateSnapshot memory beforeSnapshot,
        StateSnapshot memory afterSnapshot
    ) internal pure returns (bool) {
        return beforeSnapshot.curveState.realUsdcReserve == afterSnapshot.curveState.realUsdcReserve
            && beforeSnapshot.curveState.realTokenReserve
                == afterSnapshot.curveState.realTokenReserve
            && beforeSnapshot.curveState.virtualUsdcReserve
                == afterSnapshot.curveState.virtualUsdcReserve
            && beforeSnapshot.curveState.virtualTokenReserve
                == afterSnapshot.curveState.virtualTokenReserve
            && beforeSnapshot.curveState.accruedProtocolFees
                == afterSnapshot.curveState.accruedProtocolFees
            && beforeSnapshot.remainingGraduationCapacity
                == afterSnapshot.remainingGraduationCapacity
            && beforeSnapshot.status == afterSnapshot.status
            && beforeSnapshot.buysPaused == afterSnapshot.buysPaused
            && beforeSnapshot.allTradingPaused == afterSnapshot.allTradingPaused
            && _sameQuote(beforeSnapshot.buyQuote, afterSnapshot.buyQuote)
            && _sameQuote(beforeSnapshot.sellQuote, afterSnapshot.sellQuote);
    }

    function _pauseActionPreservedAccounting(
        StateSnapshot memory beforeSnapshot,
        StateSnapshot memory afterSnapshot
    ) internal pure returns (bool) {
        return beforeSnapshot.curveState.realUsdcReserve == afterSnapshot.curveState.realUsdcReserve
            && beforeSnapshot.curveState.realTokenReserve
                == afterSnapshot.curveState.realTokenReserve
            && beforeSnapshot.curveState.virtualUsdcReserve
                == afterSnapshot.curveState.virtualUsdcReserve
            && beforeSnapshot.curveState.virtualTokenReserve
                == afterSnapshot.curveState.virtualTokenReserve
            && beforeSnapshot.curveState.accruedProtocolFees
                == afterSnapshot.curveState.accruedProtocolFees
            && beforeSnapshot.poolQuoteBalance == afterSnapshot.poolQuoteBalance
            && beforeSnapshot.poolTokenBalance == afterSnapshot.poolTokenBalance
            && beforeSnapshot.remainingGraduationCapacity
                == afterSnapshot.remainingGraduationCapacity
            && beforeSnapshot.status == afterSnapshot.status
            && _sameQuote(beforeSnapshot.buyQuote, afterSnapshot.buyQuote)
            && _sameQuote(beforeSnapshot.sellQuote, afterSnapshot.sellQuote);
    }

    function _observeStatus() internal {
        uint8 currentStatus = uint8(pool.status());
        if (currentStatus < highestObservedPoolStatus) {
            statusRegressionDetected = true;
        } else if (currentStatus > highestObservedPoolStatus) {
            highestObservedPoolStatus = currentStatus;
        }
    }

    function _min(uint256 left, uint256 right) internal pure returns (uint256) {
        return left < right ? left : right;
    }
}
