// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Test } from "forge-std/Test.sol";

import { BondingCurveMath } from "../src/libraries/BondingCurveMath.sol";
import { FeeVault } from "../src/FeeVault.sol";
import { LaunchFactory } from "../src/LaunchFactory.sol";
import { LaunchPool } from "../src/LaunchPool.sol";
import { LibrARCToken } from "../src/LibrARCToken.sol";
import {
    DeployLocalLibrARC,
    LocalMockArcUsdc,
    LocalMockLiquidityAdapter
} from "../script/DeployLocalLibrARC.s.sol";

contract DeploymentSmokeTest is Test {
    address internal constant ADMIN = address(0xA11CE);
    address internal constant TREASURY = address(0xBEEF);
    address internal constant LIQUIDITY_RECIPIENT = address(0xF00D);
    address internal constant CREATOR = address(0xCAFE);
    address internal constant CREATOR_TOKEN_RECIPIENT = address(0xABCD);
    address internal constant SECOND_TRADER = address(0xB0B);
    address internal constant THIRD_PARTY = address(0xCA401);
    address internal constant DONOR = address(0xD0D0);

    uint256 internal constant FIXED_SUPPLY = 1_000_000_000 * 10 ** 18;
    uint256 internal constant INITIAL_CREATOR_USDC_IN = 250 * 10 ** 6;
    uint256 internal constant SECOND_TRADER_USDC_IN = 125 * 10 ** 6;
    uint256 internal constant QUOTE_DONATION_AMOUNT = 17 * 10 ** 6;
    uint256 internal constant TOKEN_DONATION_AMOUNT = 25_000 ether;

    struct SmokeContext {
        LocalMockArcUsdc quoteAsset;
        FeeVault feeVault;
        LocalMockLiquidityAdapter liquidityAdapter;
        LaunchFactory factory;
        LibrARCToken token;
        LaunchPool pool;
    }

    DeployLocalLibrARC internal deployer;

    function setUp() public {
        vm.chainId(31_337);
        deployer = new DeployLocalLibrARC();
    }

    function test_DeploymentFlowAndLifecycleSmoke() public {
        SmokeContext memory ctx = _deploySmokeContext();
        ctx = _createInitialLaunchAndBuy(ctx);
        _executeSecondaryTradingFlow(ctx);
        _reachGraduationAndAssert(ctx);
    }

    function test_DeploymentRevertsOnNon31337ChainId() public {
        vm.chainId(1);

        vm.expectRevert(
            abi.encodeWithSelector(DeployLocalLibrARC.LocalOnlyChainRequired.selector, uint256(1))
        );
        deployer.deployLocalProtocol(ADMIN, TREASURY, LIQUIDITY_RECIPIENT);
    }

    function test_DeploymentRevertsOnZeroAdmin() public {
        vm.expectRevert(DeployLocalLibrARC.LocalDeploymentInvalidAdmin.selector);
        deployer.deployLocalProtocol(address(0), TREASURY, LIQUIDITY_RECIPIENT);
    }

    function test_DeploymentRevertsOnZeroTreasury() public {
        vm.expectRevert(DeployLocalLibrARC.LocalDeploymentInvalidTreasury.selector);
        deployer.deployLocalProtocol(ADMIN, address(0), LIQUIDITY_RECIPIENT);
    }

    function test_DeploymentRevertsOnZeroLiquidityRecipient() public {
        vm.expectRevert(DeployLocalLibrARC.LocalDeploymentInvalidLiquidityRecipient.selector);
        deployer.deployLocalProtocol(ADMIN, TREASURY, address(0));
    }

    function test_DuplicateLocalLaunchesReceiveDifferentIdsAndAddresses() public {
        DeployLocalLibrARC.DeploymentResult memory deployment =
            deployer.deployLocalProtocol(ADMIN, TREASURY, LIQUIDITY_RECIPIENT);
        LaunchFactory factory = LaunchFactory(payable(deployment.launchFactory));

        vm.startPrank(CREATOR);
        (address firstToken, address firstPool, uint256 firstId) =
            factory.createLaunch("Local One", "L1", "ipfs://local-only/one");
        (address secondToken, address secondPool, uint256 secondId) =
            factory.createLaunch("Local One", "L1", "ipfs://local-only/one");
        vm.stopPrank();

        assertEq(firstId, 1);
        assertEq(secondId, 2);
        assertTrue(firstToken != secondToken);
        assertTrue(firstPool != secondPool);
    }

    function test_FactoryPauseControlsWorkForRegisteredLocalPool() public {
        DeployLocalLibrARC.DeploymentResult memory deployment =
            deployer.deployLocalProtocol(ADMIN, TREASURY, LIQUIDITY_RECIPIENT);
        LaunchFactory factory = LaunchFactory(payable(deployment.launchFactory));

        vm.prank(CREATOR);
        (, address poolAddress,) = factory.createLaunch("Pause Test", "PSE", "ipfs://pause");
        LaunchPool pool = LaunchPool(payable(poolAddress));

        vm.startPrank(ADMIN);
        factory.pausePoolBuys(poolAddress);
        assertTrue(pool.buysPaused());
        assertFalse(pool.canBuy());
        factory.unpausePoolBuys(poolAddress);
        assertFalse(pool.buysPaused());
        assertTrue(pool.canBuy());
        factory.pausePoolTrading(poolAddress);
        assertTrue(pool.allTradingPaused());
        assertFalse(pool.canBuy());
        assertFalse(pool.canSell());
        factory.unpausePoolTrading(poolAddress);
        assertFalse(pool.allTradingPaused());
        assertTrue(pool.canBuy());
        assertTrue(pool.canSell());
        vm.stopPrank();
    }

    function test_UnauthorizedUsersCannotUsePauseControls() public {
        DeployLocalLibrARC.DeploymentResult memory deployment =
            deployer.deployLocalProtocol(ADMIN, TREASURY, LIQUIDITY_RECIPIENT);
        LaunchFactory factory = LaunchFactory(payable(deployment.launchFactory));

        vm.prank(CREATOR);
        (, address poolAddress,) = factory.createLaunch("Auth Test", "AUT", "ipfs://auth");

        bytes32 pauserRole = factory.PAUSER_ROLE();
        vm.prank(SECOND_TRADER);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, SECOND_TRADER, pauserRole
            )
        );
        factory.pausePoolBuys(poolAddress);
    }

    function test_TotalTokenSupplyRemainsFixed() public {
        DeployLocalLibrARC.DeploymentResult memory deployment =
            deployer.deployLocalProtocol(ADMIN, TREASURY, LIQUIDITY_RECIPIENT);
        LocalMockArcUsdc quoteAsset = LocalMockArcUsdc(deployment.quoteAsset);
        LaunchFactory factory = LaunchFactory(payable(deployment.launchFactory));

        quoteAsset.mint(CREATOR, INITIAL_CREATOR_USDC_IN);
        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), INITIAL_CREATOR_USDC_IN);

        vm.prank(CREATOR);
        (address launchTokenAddress, address launchPoolAddress,,) = factory.createLaunchAndBuy(
            "Supply Test",
            "SUP",
            "ipfs://supply",
            INITIAL_CREATOR_USDC_IN,
            1,
            block.timestamp,
            CREATOR
        );

        LibrARCToken token = LibrARCToken(launchTokenAddress);
        LaunchPool pool = LaunchPool(payable(launchPoolAddress));

        quoteAsset.mint(SECOND_TRADER, SECOND_TRADER_USDC_IN);
        vm.prank(SECOND_TRADER);
        quoteAsset.approve(address(pool), SECOND_TRADER_USDC_IN);

        vm.prank(SECOND_TRADER);
        pool.buy(SECOND_TRADER_USDC_IN, 1, block.timestamp, SECOND_TRADER);

        uint256 sellAmount = token.balanceOf(SECOND_TRADER) / 2;
        vm.prank(SECOND_TRADER);
        token.approve(address(pool), sellAmount);

        vm.prank(SECOND_TRADER);
        pool.sell(sellAmount, 0, block.timestamp, SECOND_TRADER);

        assertEq(token.totalSupply(), FIXED_SUPPLY);
        assertEq(token.totalSupply(), token.FIXED_SUPPLY());
    }

    function _grossInputForNetUsdcAtOnePercent(uint256 netUsdcAmount)
        internal
        pure
        returns (uint256 grossInput)
    {
        uint256 quotient = netUsdcAmount / 99;
        uint256 remainder = netUsdcAmount % 99;
        grossInput = quotient * 100 + remainder;
    }

    function _deploySmokeContext() internal returns (SmokeContext memory ctx) {
        DeployLocalLibrARC.DeploymentResult memory deployment =
            deployer.deployLocalProtocol(ADMIN, TREASURY, LIQUIDITY_RECIPIENT);

        ctx.quoteAsset = LocalMockArcUsdc(deployment.quoteAsset);
        ctx.feeVault = FeeVault(payable(deployment.feeVault));
        ctx.liquidityAdapter = LocalMockLiquidityAdapter(deployment.liquidityAdapter);
        ctx.factory = LaunchFactory(payable(deployment.launchFactory));
    }

    function _createInitialLaunchAndBuy(SmokeContext memory ctx)
        internal
        returns (SmokeContext memory)
    {
        uint256 factoryQuoteBalanceBefore = ctx.quoteAsset.balanceOf(address(ctx.factory));
        BondingCurveMath.BuyQuote memory initialQuote = BondingCurveMath.quoteBuy(
            BondingCurveMath.CurveState({
                realUsdcReserve: 0,
                realTokenReserve: FIXED_SUPPLY,
                virtualUsdcReserve: ctx.factory.virtualUsdcReserve(),
                virtualTokenReserve: ctx.factory.virtualTokenReserve(),
                accruedProtocolFees: 0
            }),
            INITIAL_CREATOR_USDC_IN,
            ctx.factory.buyFeeBps()
        );

        ctx.quoteAsset.mint(CREATOR, INITIAL_CREATOR_USDC_IN);
        vm.prank(CREATOR);
        ctx.quoteAsset.approve(address(ctx.factory), INITIAL_CREATOR_USDC_IN);

        vm.prank(CREATOR);
        (
            address launchTokenAddress,
            address launchPoolAddress,
            uint256 launchId,
            uint256 tokenAmountOut
        ) = ctx.factory
            .createLaunchAndBuy(
                "Local LibrARC",
                "LLA",
                "ipfs://local-only/launch-1",
                INITIAL_CREATOR_USDC_IN,
                initialQuote.tokenAmountOut,
                block.timestamp,
                CREATOR_TOKEN_RECIPIENT
            );

        ctx.token = LibrARCToken(launchTokenAddress);
        ctx.pool = LaunchPool(payable(launchPoolAddress));

        BondingCurveMath.CurveState memory afterInitialBuy = ctx.pool.curveState();
        assertEq(launchId, 1);
        assertEq(tokenAmountOut, initialQuote.tokenAmountOut);
        assertEq(ctx.factory.launchCount(), 1);

        (address recordedCreator, address recordedToken, address recordedPool,) =
            ctx.factory.launchById(launchId);
        assertEq(recordedCreator, CREATOR);
        assertEq(recordedToken, launchTokenAddress);
        assertEq(recordedPool, launchPoolAddress);
        assertEq(ctx.factory.poolByToken(launchTokenAddress), launchPoolAddress);
        assertEq(ctx.factory.tokenByPool(launchPoolAddress), launchTokenAddress);
        assertEq(ctx.token.balanceOf(address(ctx.factory)), 0);
        assertEq(uint256(ctx.pool.status()), uint256(LaunchPool.PoolStatus.Active));
        assertEq(ctx.token.balanceOf(CREATOR_TOKEN_RECIPIENT), initialQuote.tokenAmountOut);
        assertEq(ctx.quoteAsset.balanceOf(address(ctx.pool)), INITIAL_CREATOR_USDC_IN);
        _assertCurveStateEq(afterInitialBuy, initialQuote.nextState);
        assertEq(afterInitialBuy.accruedProtocolFees, initialQuote.fee);
        assertEq(afterInitialBuy.virtualUsdcReserve, ctx.factory.virtualUsdcReserve());
        assertEq(afterInitialBuy.virtualTokenReserve, ctx.factory.virtualTokenReserve());
        assertEq(ctx.quoteAsset.balanceOf(address(ctx.factory)), factoryQuoteBalanceBefore);
        assertEq(ctx.quoteAsset.allowance(address(ctx.factory), address(ctx.pool)), 0);
        assertEq(ctx.token.totalSupply(), FIXED_SUPPLY);

        return ctx;
    }

    function _executeSecondaryTradingFlow(SmokeContext memory ctx) internal {
        BondingCurveMath.CurveState memory beforeSecondBuy = ctx.pool.curveState();
        BondingCurveMath.BuyQuote memory secondBuyQuote =
            BondingCurveMath.quoteBuy(beforeSecondBuy, SECOND_TRADER_USDC_IN, ctx.pool.buyFeeBps());

        ctx.quoteAsset.mint(SECOND_TRADER, SECOND_TRADER_USDC_IN);
        vm.prank(SECOND_TRADER);
        ctx.quoteAsset.approve(address(ctx.pool), SECOND_TRADER_USDC_IN);

        vm.prank(SECOND_TRADER);
        uint256 secondBuyTokenAmount = ctx.pool
            .buy(
                SECOND_TRADER_USDC_IN, secondBuyQuote.tokenAmountOut, block.timestamp, SECOND_TRADER
            );

        assertEq(secondBuyTokenAmount, secondBuyQuote.tokenAmountOut);
        assertEq(ctx.token.balanceOf(SECOND_TRADER), secondBuyQuote.tokenAmountOut);
        _assertCurveStateEq(ctx.pool.curveState(), secondBuyQuote.nextState);

        uint256 sellAmount = secondBuyTokenAmount / 2;
        BondingCurveMath.SellQuote memory sellQuote = BondingCurveMath.quoteSell(
            ctx.pool.curveState(), sellAmount, ctx.pool.sellFeeBps(), ctx.token.totalSupply()
        );

        vm.prank(SECOND_TRADER);
        ctx.token.approve(address(ctx.pool), sellAmount);

        vm.prank(SECOND_TRADER);
        uint256 sellUsdcAmountOut =
            ctx.pool.sell(sellAmount, sellQuote.netUsdcAmountOut, block.timestamp, SECOND_TRADER);

        assertEq(sellUsdcAmountOut, sellQuote.netUsdcAmountOut);
        _assertCurveStateEq(ctx.pool.curveState(), sellQuote.nextState);

        _sweepFeesAndDonate(ctx);
    }

    function _sweepFeesAndDonate(SmokeContext memory ctx) internal {
        BondingCurveMath.CurveState memory beforeSweep = ctx.pool.curveState();
        uint256 feeVaultBalanceBefore = ctx.quoteAsset.balanceOf(address(ctx.feeVault));
        uint256 poolQuoteBalanceBeforeSweep = ctx.quoteAsset.balanceOf(address(ctx.pool));

        vm.prank(THIRD_PARTY);
        uint256 sweptFees = ctx.pool.sweepProtocolFees();

        BondingCurveMath.CurveState memory afterSweep = ctx.pool.curveState();
        assertEq(sweptFees, beforeSweep.accruedProtocolFees);
        assertEq(afterSweep.realUsdcReserve, beforeSweep.realUsdcReserve);
        assertEq(afterSweep.realTokenReserve, beforeSweep.realTokenReserve);
        assertEq(afterSweep.virtualUsdcReserve, beforeSweep.virtualUsdcReserve);
        assertEq(afterSweep.virtualTokenReserve, beforeSweep.virtualTokenReserve);
        assertEq(afterSweep.accruedProtocolFees, 0);
        assertEq(ctx.quoteAsset.balanceOf(address(ctx.feeVault)), feeVaultBalanceBefore + sweptFees);
        assertEq(
            ctx.quoteAsset.balanceOf(address(ctx.pool)), poolQuoteBalanceBeforeSweep - sweptFees
        );

        BondingCurveMath.CurveState memory beforeDonations = ctx.pool.curveState();
        uint256 remainingCapacityBeforeDonations = ctx.pool.remainingGraduationCapacity();

        ctx.quoteAsset.mint(DONOR, QUOTE_DONATION_AMOUNT);
        vm.prank(DONOR);
        assertTrue(ctx.quoteAsset.transfer(address(ctx.pool), QUOTE_DONATION_AMOUNT));

        vm.prank(CREATOR_TOKEN_RECIPIENT);
        assertTrue(ctx.token.transfer(address(ctx.pool), TOKEN_DONATION_AMOUNT));

        BondingCurveMath.CurveState memory afterDonations = ctx.pool.curveState();
        _assertCurveStateEq(afterDonations, beforeDonations);
        assertEq(ctx.pool.remainingGraduationCapacity(), remainingCapacityBeforeDonations);
    }

    function _reachGraduationAndAssert(SmokeContext memory ctx) internal {
        uint256 remainingCapacity = ctx.pool.remainingGraduationCapacity();
        uint256 thresholdBuyAmountIn = _grossInputForNetUsdcAtOnePercent(remainingCapacity);
        (BondingCurveMath.BuyQuote memory thresholdQuote, bool reachesThreshold) =
            ctx.pool.quoteBuy(thresholdBuyAmountIn);

        assertTrue(reachesThreshold);
        assertEq(thresholdQuote.nextState.realUsdcReserve, ctx.pool.graduationThreshold());

        ctx.quoteAsset.mint(CREATOR, thresholdBuyAmountIn);
        vm.prank(CREATOR);
        ctx.quoteAsset.approve(address(ctx.pool), thresholdBuyAmountIn);

        vm.prank(CREATOR);
        uint256 thresholdBuyTokenAmount = ctx.pool
            .buy(thresholdBuyAmountIn, thresholdQuote.tokenAmountOut, block.timestamp, CREATOR);

        assertEq(thresholdBuyTokenAmount, thresholdQuote.tokenAmountOut);
        assertEq(uint256(ctx.pool.status()), uint256(LaunchPool.PoolStatus.GraduationPending));
        _assertCurveStateEq(ctx.pool.curveState(), thresholdQuote.nextState);

        BondingCurveMath.CurveState memory beforeGraduation = ctx.pool.curveState();
        uint256 poolQuoteBalanceBeforeGraduation = ctx.quoteAsset.balanceOf(address(ctx.pool));
        uint256 poolTokenBalanceBeforeGraduation = ctx.token.balanceOf(address(ctx.pool));
        uint256 adapterQuoteBalanceBefore = ctx.quoteAsset.balanceOf(address(ctx.liquidityAdapter));
        uint256 adapterTokenBalanceBefore = ctx.token.balanceOf(address(ctx.liquidityAdapter));

        vm.prank(THIRD_PARTY);
        bytes32 migrationId = ctx.pool.graduate();

        BondingCurveMath.CurveState memory afterGraduation = ctx.pool.curveState();
        assertTrue(migrationId != bytes32(0));
        assertEq(uint256(ctx.pool.status()), uint256(LaunchPool.PoolStatus.Graduated));
        assertEq(afterGraduation.realUsdcReserve, 0);
        assertEq(afterGraduation.realTokenReserve, 0);
        assertEq(afterGraduation.accruedProtocolFees, beforeGraduation.accruedProtocolFees);
        assertEq(afterGraduation.virtualUsdcReserve, beforeGraduation.virtualUsdcReserve);
        assertEq(afterGraduation.virtualTokenReserve, beforeGraduation.virtualTokenReserve);
        assertEq(ctx.liquidityAdapter.lastMigrationId(), migrationId);
        assertEq(ctx.liquidityAdapter.lastCaller(), address(ctx.pool));
        assertEq(ctx.liquidityAdapter.lastLaunchToken(), address(ctx.token));
        assertEq(ctx.liquidityAdapter.lastQuoteAsset(), address(ctx.quoteAsset));
        assertEq(ctx.liquidityAdapter.lastLaunchTokenAmount(), beforeGraduation.realTokenReserve);
        assertEq(ctx.liquidityAdapter.lastQuoteAssetAmount(), beforeGraduation.realUsdcReserve);
        assertEq(ctx.liquidityAdapter.lastLiquidityRecipient(), LIQUIDITY_RECIPIENT);
        assertEq(
            ctx.quoteAsset.balanceOf(address(ctx.liquidityAdapter)),
            adapterQuoteBalanceBefore + beforeGraduation.realUsdcReserve
        );
        assertEq(
            ctx.token.balanceOf(address(ctx.liquidityAdapter)),
            adapterTokenBalanceBefore + beforeGraduation.realTokenReserve
        );
        assertEq(
            ctx.quoteAsset.balanceOf(address(ctx.pool)),
            poolQuoteBalanceBeforeGraduation - beforeGraduation.realUsdcReserve
        );
        assertEq(
            ctx.token.balanceOf(address(ctx.pool)),
            poolTokenBalanceBeforeGraduation - beforeGraduation.realTokenReserve
        );
        assertEq(
            ctx.quoteAsset.balanceOf(address(ctx.pool)),
            beforeGraduation.accruedProtocolFees + QUOTE_DONATION_AMOUNT
        );
        assertEq(ctx.token.balanceOf(address(ctx.pool)), TOKEN_DONATION_AMOUNT);
        assertEq(ctx.token.allowance(address(ctx.pool), address(ctx.liquidityAdapter)), 0);
        assertEq(ctx.quoteAsset.allowance(address(ctx.pool), address(ctx.liquidityAdapter)), 0);
        assertEq(ctx.token.totalSupply(), FIXED_SUPPLY);

        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Graduated
            )
        );
        ctx.pool.buy(1, 0, block.timestamp, CREATOR);

        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Graduated
            )
        );
        ctx.pool.sell(1 ether, 0, block.timestamp, SECOND_TRADER);
    }

    function _assertCurveStateEq(
        BondingCurveMath.CurveState memory left,
        BondingCurveMath.CurveState memory right
    ) internal pure {
        assertEq(left.realUsdcReserve, right.realUsdcReserve);
        assertEq(left.realTokenReserve, right.realTokenReserve);
        assertEq(left.virtualUsdcReserve, right.virtualUsdcReserve);
        assertEq(left.virtualTokenReserve, right.virtualTokenReserve);
        assertEq(left.accruedProtocolFees, right.accruedProtocolFees);
    }
}
