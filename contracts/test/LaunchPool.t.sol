// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {BondingCurveMath} from "../src/libraries/BondingCurveMath.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {LaunchPool} from "../src/LaunchPool.sol";
import {LibrARCToken} from "../src/LibrARCToken.sol";
import {MockLiquidityAdapter} from "./mocks/MockLiquidityAdapter.sol";

contract MockQuoteAsset is ERC20 {
    constructor() ERC20("Arc USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SurplusBalanceToken is ERC20 {
    address private _designatedPool;
    uint256 private _extraPoolBalance;

    constructor(address initialHolder, uint256 totalSupply_) ERC20("Surplus Launch Token", "SLT") {
        _mint(initialHolder, totalSupply_);
    }

    function setPoolBalanceBonus(address pool_, uint256 extraPoolBalance_) external {
        _designatedPool = pool_;
        _extraPoolBalance = extraPoolBalance_;
    }

    function balanceOf(address account) public view override returns (uint256) {
        uint256 baseBalance = super.balanceOf(account);
        if (account == _designatedPool) {
            return baseBalance + _extraPoolBalance;
        }
        return baseBalance;
    }
}

contract LaunchPoolHarness is LaunchPool {
    constructor(
        address factory_,
        address launchToken_,
        address quoteAsset_,
        address feeVault_,
        address liquidityAdapter_,
        address liquidityRecipient_,
        uint256 totalTokenSupply_,
        uint256 virtualUsdcReserve_,
        uint256 virtualTokenReserve_,
        uint256 buyFeeBps_,
        uint256 sellFeeBps_,
        uint256 graduationThreshold_
    )
        LaunchPool(
            factory_,
            launchToken_,
            quoteAsset_,
            feeVault_,
            liquidityAdapter_,
            liquidityRecipient_,
            totalTokenSupply_,
            virtualUsdcReserve_,
            virtualTokenReserve_,
            buyFeeBps_,
            sellFeeBps_,
            graduationThreshold_
        )
    {}

    function exposedSetAccountedState(
        uint256 realUsdcReserve_,
        uint256 realTokenReserve_,
        uint256 accruedProtocolFees_,
        PoolStatus status_
    ) external {
        _realUsdcReserve = realUsdcReserve_;
        _realTokenReserve = realTokenReserve_;
        _accruedProtocolFees = accruedProtocolFees_;
        status = status_;
    }
}

contract LaunchPoolTest is Test, IERC20Errors {
    event PoolInitialized(
        address indexed launchToken, uint256 totalTokenSupply, uint256 virtualUsdcReserve, uint256 virtualTokenReserve
    );

    address internal constant OTHER_ACCOUNT = address(0xB0B);
    address internal constant LIQUIDITY_RECIPIENT = address(0xCAFE);

    uint256 internal constant DEFAULT_VIRTUAL_USDC_RESERVE = 1_000_000;
    uint256 internal constant DEFAULT_VIRTUAL_TOKEN_RESERVE = 500_000_000 * 10 ** 18;
    uint256 internal constant DEFAULT_BUY_FEE_BPS = 250;
    uint256 internal constant DEFAULT_SELL_FEE_BPS = 300;
    uint256 internal constant DEFAULT_GRADUATION_THRESHOLD = 10_000_000;
    uint256 internal constant SELL_TEST_VIRTUAL_TOKEN_RESERVE = 1_000_000 ether;
    uint256 internal constant SELL_TEST_REAL_TOKEN_RESERVE = 1_000_000 ether;
    uint256 internal constant SELL_TEST_REAL_USDC_RESERVE = 1_000_000;

    MockQuoteAsset internal quoteAsset;
    FeeVault internal feeVault;
    MockLiquidityAdapter internal liquidityAdapter;

    function setUp() public {
        quoteAsset = new MockQuoteAsset();
        feeVault = new FeeVault(address(this), address(this), 1);
        liquidityAdapter = new MockLiquidityAdapter();
    }

    function test_ConstructorStoresAllConfigurationCorrectly() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();

        assertEq(pool.factory(), address(this));
        assertEq(address(pool.launchToken()), address(token));
        assertEq(address(pool.quoteAsset()), address(quoteAsset));
        assertEq(pool.feeVault(), address(feeVault));
        assertEq(address(pool.liquidityAdapter()), address(liquidityAdapter));
        assertEq(pool.liquidityRecipient(), LIQUIDITY_RECIPIENT);
        assertEq(pool.totalTokenSupply(), token.FIXED_SUPPLY());
        assertEq(pool.virtualUsdcReserve(), DEFAULT_VIRTUAL_USDC_RESERVE);
        assertEq(pool.virtualTokenReserve(), DEFAULT_VIRTUAL_TOKEN_RESERVE);
        assertEq(pool.buyFeeBps(), DEFAULT_BUY_FEE_BPS);
        assertEq(pool.sellFeeBps(), DEFAULT_SELL_FEE_BPS);
        assertEq(pool.graduationThreshold(), DEFAULT_GRADUATION_THRESHOLD);
    }

    function test_InitialStatusIsUninitialized() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();

        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Uninitialized));
    }

    function test_InitialAccountedReservesAreZero() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertEq(state.realUsdcReserve, 0);
        assertEq(state.realTokenReserve, 0);
        assertEq(state.accruedProtocolFees, 0);
    }

    function test_RevertWhenFactoryIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroFactory.selector);
        new LaunchPoolHarness(
            address(0),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenLaunchTokenIsZero() public {
        vm.expectRevert(LaunchPool.ZeroLaunchToken.selector);
        new LaunchPoolHarness(
            address(this),
            address(0),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            1,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenQuoteAssetIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroQuoteAsset.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(0),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenFeeVaultIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroFeeVault.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(0),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenLiquidityAdapterIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroLiquidityAdapter.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(0),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenLiquidityRecipientIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroLiquidityRecipient.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            address(0),
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenTotalTokenSupplyIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));

        vm.expectRevert(LaunchPool.ZeroTotalTokenSupply.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            0,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenVirtualUsdcReserveIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroVirtualUsdcReserve.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            0,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenVirtualTokenReserveIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroVirtualTokenReserve.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            0,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenBuyFeeEqualsTenThousand() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.InvalidBuyFeeBps.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            10_000,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenBuyFeeExceedsTenThousand() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.InvalidBuyFeeBps.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            10_001,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenSellFeeEqualsTenThousand() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.InvalidSellFeeBps.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            10_000,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenSellFeeExceedsTenThousand() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.InvalidSellFeeBps.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            10_001,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function test_RevertWhenGraduationThresholdIsZero() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 fixedSupply = token.FIXED_SUPPLY();

        vm.expectRevert(LaunchPool.ZeroGraduationThreshold.selector);
        new LaunchPoolHarness(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            fixedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            0
        );
    }

    function test_OnlyFactoryCanInitialize() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);

        vm.prank(OTHER_ACCOUNT);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.UnauthorizedFactory.selector, OTHER_ACCOUNT, address(this)));
        pool.initialize();
    }

    function test_InitializationWithoutTokenFundingReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();

        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.InsufficientTokenFunding.selector, uint256(0), token.FIXED_SUPPLY())
        );
        pool.initialize();
    }

    function test_IncorrectTokenTotalSupplyReverts() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        uint256 expectedSupply = token.FIXED_SUPPLY() - 1;
        LaunchPoolHarness pool = _deployPool(
            address(token),
            expectedSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );

        assertTrue(token.transfer(address(pool), token.FIXED_SUPPLY()));

        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.InvalidTokenTotalSupply.selector, token.FIXED_SUPPLY(), expectedSupply)
        );
        pool.initialize();
    }

    function test_FullyFundedInitializationSucceeds() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);

        pool.initialize();

        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
    }

    function test_StatusBecomesActiveAfterInitialization() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);

        pool.initialize();

        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
    }

    function test_RealTokenReserveBecomesExactlyTotalTokenSupply() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);

        pool.initialize();

        BondingCurveMath.CurveState memory state = pool.curveState();
        assertEq(state.realTokenReserve, token.FIXED_SUPPLY());
    }

    function test_RealUsdcReserveRemainsZeroAfterInitialization() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);

        pool.initialize();

        BondingCurveMath.CurveState memory state = pool.curveState();
        assertEq(state.realUsdcReserve, 0);
    }

    function test_AccruedProtocolFeesRemainZeroAfterInitialization() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);

        pool.initialize();

        BondingCurveMath.CurveState memory state = pool.curveState();
        assertEq(state.accruedProtocolFees, 0);
    }

    function test_InitializationEmitsPoolInitialized() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);

        vm.expectEmit(true, false, false, true, address(pool));
        emit PoolInitialized(
            address(token), token.FIXED_SUPPLY(), DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE
        );
        pool.initialize();
    }

    function test_SecondInitializationReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.PoolAlreadyInitialized.selector, LaunchPool.PoolStatus.Active)
        );
        pool.initialize();
    }

    function test_ExcessDonatedLaunchTokensAreNotCountedInRealTokenReserve() public {
        SurplusBalanceToken token = new SurplusBalanceToken(address(this), 1_000_000);
        LaunchPoolHarness pool = _deployPool(
            address(token),
            token.totalSupply(),
            DEFAULT_VIRTUAL_USDC_RESERVE,
            1_000_000,
            0,
            0,
            DEFAULT_GRADUATION_THRESHOLD
        );

        assertTrue(token.transfer(address(pool), token.totalSupply()));
        token.setPoolBalanceBonus(address(pool), 555_555);

        pool.initialize();

        BondingCurveMath.CurveState memory state = pool.curveState();
        assertEq(state.realTokenReserve, token.totalSupply());
    }

    function test_FailedInitializationDoesNotPartiallyUpdateState() public {
        LibrARCToken token = new LibrARCToken("LibrARC", "LARC", address(this));
        LaunchPoolHarness pool = _deployPool(
            address(token),
            token.FIXED_SUPPLY() - 1,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );

        assertTrue(token.transfer(address(pool), token.FIXED_SUPPLY()));

        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.InvalidTokenTotalSupply.selector, token.FIXED_SUPPLY(), token.FIXED_SUPPLY() - 1
            )
        );
        pool.initialize();

        BondingCurveMath.CurveState memory state = pool.curveState();
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Uninitialized));
        assertEq(state.realUsdcReserve, 0);
        assertEq(state.realTokenReserve, 0);
        assertEq(state.accruedProtocolFees, 0);
    }

    function test_QuoteBuyBeforeInitializationReverts() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();

        vm.expectRevert(abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Uninitialized));
        pool.quoteBuy(1);
    }

    function test_ValidQuoteUsesStoredBuyFee() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote, bool reachesGraduationThreshold) = pool.quoteBuy(10_000);

        assertEq(quote.fee, 250);
        assertEq(quote.netUsdcIn, 9750);
        assertFalse(reachesGraduationThreshold);
    }

    function test_QuoteBuyDoesNotMutateState() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 statusBefore = uint256(pool.status());

        pool.quoteBuy(10_000);

        BondingCurveMath.CurveState memory stateAfter = pool.curveState();
        assertEq(uint256(pool.status()), statusBefore);
        _assertCurveStateEq(stateBefore, stateAfter);
    }

    function test_EqualityWithGraduationThresholdSucceeds() public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 1000);
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote, bool reachesGraduationThreshold) = pool.quoteBuy(1000);

        assertEq(quote.nextState.realUsdcReserve, 1000);
        assertTrue(reachesGraduationThreshold);
    }

    function test_EqualityReturnsReachesGraduationThresholdTrue() public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 777);
        _fundPoolExact(pool, token);
        pool.initialize();

        (, bool reachesGraduationThreshold) = pool.quoteBuy(777);

        assertTrue(reachesGraduationThreshold);
    }

    function test_ReserveValueBelowThresholdReturnsFalse() public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 1001);
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote, bool reachesGraduationThreshold) = pool.quoteBuy(1000);

        assertEq(quote.nextState.realUsdcReserve, 1000);
        assertFalse(reachesGraduationThreshold);
    }

    function test_ReserveValueAboveThresholdReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 999);
        _fundPoolExact(pool, token);
        pool.initialize();

        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.GraduationThresholdExceeded.selector, uint256(0), uint256(1000), 999)
        );
        pool.quoteBuy(1000);
    }

    function test_AccruedProtocolFeesAreExcludedFromGraduationCapacity() public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 200);
        _fundPoolExact(pool, token);
        pool.initialize();

        pool.exposedSetAccountedState(50, token.FIXED_SUPPLY(), 1000, LaunchPool.PoolStatus.Active);

        assertEq(pool.remainingGraduationCapacity(), 150);

        (BondingCurveMath.BuyQuote memory quote, bool reachesGraduationThreshold) = pool.quoteBuy(150);

        assertEq(quote.nextState.realUsdcReserve, 200);
        assertTrue(reachesGraduationThreshold);
    }

    function test_RawUsdcDonationsDoNotAffectQuoteResults() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quoteBefore, bool reachesBefore) = pool.quoteBuy(10_000);
        quoteAsset.mint(address(pool), 5_000_000);
        (BondingCurveMath.BuyQuote memory quoteAfter, bool reachesAfter) = pool.quoteBuy(10_000);

        _assertBuyQuoteEq(quoteBefore, quoteAfter);
        assertEq(reachesBefore, reachesAfter);
    }

    function test_IdenticalStateAndInputProduceIdenticalResults() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory firstQuote, bool firstReaches) = pool.quoteBuy(50_000);
        (BondingCurveMath.BuyQuote memory secondQuote, bool secondReaches) = pool.quoteBuy(50_000);

        _assertBuyQuoteEq(firstQuote, secondQuote);
        assertEq(firstReaches, secondReaches);
    }

    function test_QuoteSellBeforeInitializationReverts() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();

        vm.expectRevert(abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Uninitialized));
        pool.quoteSell(1);
    }

    function test_QuoteSellUsesTheStoredSellFee() public {
        (LaunchPoolHarness pool,) = _deployConfiguredPool(
            DEFAULT_VIRTUAL_USDC_RESERVE,
            SELL_TEST_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
        LibrARCToken token = LibrARCToken(address(pool.launchToken()));
        _fundPoolExact(pool, token);
        pool.initialize();

        pool.exposedSetAccountedState(
            SELL_TEST_REAL_USDC_RESERVE, SELL_TEST_REAL_TOKEN_RESERVE, 0, LaunchPool.PoolStatus.Active
        );

        BondingCurveMath.SellQuote memory quote = pool.quoteSell(2 ether);

        assertEq(quote.fee, (quote.grossUsdcAmountOut * DEFAULT_SELL_FEE_BPS) / 10_000);
        assertEq(quote.nextState.accruedProtocolFees, quote.fee);
    }

    function test_QuoteSellDoesNotMutateState() public {
        (LaunchPoolHarness pool,) = _deployConfiguredPool(
            DEFAULT_VIRTUAL_USDC_RESERVE,
            SELL_TEST_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
        LibrARCToken token = LibrARCToken(address(pool.launchToken()));
        _fundPoolExact(pool, token);
        pool.initialize();

        pool.exposedSetAccountedState(
            SELL_TEST_REAL_USDC_RESERVE, SELL_TEST_REAL_TOKEN_RESERVE, 0, LaunchPool.PoolStatus.Active
        );
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 statusBefore = uint256(pool.status());

        pool.quoteSell(2 ether);

        BondingCurveMath.CurveState memory stateAfter = pool.curveState();
        assertEq(uint256(pool.status()), statusBefore);
        _assertCurveStateEq(stateBefore, stateAfter);
    }

    function test_InitialSellQuoteFailsSafelyWhenNoRealUsdcReserveExists() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        pool.exposedSetAccountedState(0, token.FIXED_SUPPLY() - 1 ether, 0, LaunchPool.PoolStatus.Active);

        vm.expectRevert();
        pool.quoteSell(1 ether);
    }

    function test_RawTokenOrQuoteAssetDonationsDoNotAffectInternalPricingState() public {
        SurplusBalanceToken token = new SurplusBalanceToken(address(this), 1_000_000 ether);
        uint256 accountedRealTokenReserve = 900_000 ether;
        LaunchPoolHarness pool = _deployPool(
            address(token),
            token.totalSupply(),
            DEFAULT_VIRTUAL_USDC_RESERVE,
            SELL_TEST_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
        assertTrue(token.transfer(address(pool), token.totalSupply()));
        pool.initialize();

        pool.exposedSetAccountedState(
            SELL_TEST_REAL_USDC_RESERVE, accountedRealTokenReserve, 0, LaunchPool.PoolStatus.Active
        );

        BondingCurveMath.SellQuote memory quoteBefore = pool.quoteSell(2 ether);
        token.setPoolBalanceBonus(address(pool), 5 ether);
        quoteAsset.mint(address(pool), 1_000_000);
        BondingCurveMath.SellQuote memory quoteAfter = pool.quoteSell(2 ether);

        assertEq(quoteBefore.fee, quoteAfter.fee);
        assertEq(quoteBefore.grossUsdcAmountOut, quoteAfter.grossUsdcAmountOut);
        assertEq(quoteBefore.netUsdcAmountOut, quoteAfter.netUsdcAmountOut);
        _assertCurveStateEq(quoteBefore.nextState, quoteAfter.nextState);
    }

    function test_CurveStateReturnsTheExactInternalValues() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();
        pool.exposedSetAccountedState(123, 456, 789, LaunchPool.PoolStatus.Active);

        BondingCurveMath.CurveState memory state = pool.curveState();

        assertEq(state.realUsdcReserve, 123);
        assertEq(state.realTokenReserve, 456);
        assertEq(state.virtualUsdcReserve, DEFAULT_VIRTUAL_USDC_RESERVE);
        assertEq(state.virtualTokenReserve, DEFAULT_VIRTUAL_TOKEN_RESERVE);
        assertEq(state.accruedProtocolFees, 789);
    }

    function test_RemainingGraduationCapacityReturnsTheCorrectValue() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();
        pool.exposedSetAccountedState(250, 0, 999, LaunchPool.PoolStatus.Active);

        assertEq(pool.remainingGraduationCapacity(), DEFAULT_GRADUATION_THRESHOLD - 250);
    }

    function test_IsTradingActiveIsFalseBeforeInitialization() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();

        assertFalse(pool.isTradingActive());
    }

    function test_IsTradingActiveIsTrueAfterInitialization() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        assertTrue(pool.isTradingActive());
    }

    function test_DirectNativeTransferReverts() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();
        vm.deal(address(this), 1 ether);

        (bool success, bytes memory data) = address(pool).call{value: 1}("");

        assertFalse(success);
        assertEq(_revertSelector(data), LaunchPool.NativeAssetNotAccepted.selector);
        assertEq(address(pool).balance, 0);
    }

    function test_UnknownCalldataReverts() public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();

        (bool success, bytes memory data) = address(pool).call(hex"12345678");

        assertFalse(success);
        assertEq(_revertSelector(data), LaunchPool.NativeAssetNotAccepted.selector);
        assertEq(address(pool).balance, 0);
    }

    function testFuzz_ValidConstructorVirtualReserves(uint256 virtualUsdcReserve, uint256 virtualTokenReserve) public {
        virtualUsdcReserve = bound(virtualUsdcReserve, 1, type(uint128).max);
        virtualTokenReserve = bound(virtualTokenReserve, 1, type(uint128).max);

        (LaunchPoolHarness pool,) = _deployConfiguredPool(
            virtualUsdcReserve,
            virtualTokenReserve,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );

        assertEq(pool.virtualUsdcReserve(), virtualUsdcReserve);
        assertEq(pool.virtualTokenReserve(), virtualTokenReserve);
    }

    function testFuzz_ValidFeeValuesBelowTenThousand(uint256 buyFee, uint256 sellFee) public {
        buyFee = bound(buyFee, 0, 9999);
        sellFee = bound(sellFee, 0, 9999);

        (LaunchPoolHarness pool,) = _deployConfiguredPool(
            DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, buyFee, sellFee, DEFAULT_GRADUATION_THRESHOLD
        );

        assertEq(pool.buyFeeBps(), buyFee);
        assertEq(pool.sellFeeBps(), sellFee);
    }

    function testFuzz_SuccessfulInitializationWithExactTokenFunding(
        uint256 virtualUsdcReserve,
        uint256 virtualTokenReserve,
        uint256 graduationThreshold
    ) public {
        virtualUsdcReserve = bound(virtualUsdcReserve, 1, type(uint128).max);
        virtualTokenReserve = bound(virtualTokenReserve, 1, type(uint128).max);
        graduationThreshold = bound(graduationThreshold, 1, type(uint128).max);

        (LaunchPoolHarness pool, LibrARCToken token) = _deployConfiguredPool(
            virtualUsdcReserve, virtualTokenReserve, DEFAULT_BUY_FEE_BPS, DEFAULT_SELL_FEE_BPS, graduationThreshold
        );
        _fundPoolExact(pool, token);

        pool.initialize();

        BondingCurveMath.CurveState memory state = pool.curveState();
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
        assertEq(state.realTokenReserve, token.FIXED_SUPPLY());
        assertEq(state.realUsdcReserve, 0);
        assertEq(state.accruedProtocolFees, 0);
    }

    function testFuzz_ExcessTokenDonations(uint256 extraBalance) public {
        extraBalance = bound(extraBalance, 1, type(uint128).max);

        SurplusBalanceToken token = new SurplusBalanceToken(address(this), 1_000_000);
        LaunchPoolHarness pool = _deployPool(address(token), token.totalSupply(), 1000, 2000, 0, 0, 1_000_000);

        assertTrue(token.transfer(address(pool), token.totalSupply()));
        token.setPoolBalanceBonus(address(pool), extraBalance);

        pool.initialize();

        assertEq(pool.curveState().realTokenReserve, token.totalSupply());
    }

    function testFuzz_ValidBuyQuotesBoundedBelowTheGraduationThreshold(uint256 usdcAmountIn) public {
        uint256 threshold = 1_000_000;
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, threshold);
        _fundPoolExact(pool, token);
        pool.initialize();

        usdcAmountIn = bound(usdcAmountIn, 1, threshold);

        (BondingCurveMath.BuyQuote memory quote, bool reachesGraduationThreshold) = pool.quoteBuy(usdcAmountIn);

        assertLe(quote.nextState.realUsdcReserve, threshold);
        assertLe(quote.tokenAmountOut, token.FIXED_SUPPLY());
        assertEq(reachesGraduationThreshold, quote.nextState.realUsdcReserve == threshold);
    }

    function testFuzz_QuoteFunctionsNeverMutateStoredState(uint256 usdcAmountIn, uint256 tokenAmountIn) public {
        (LaunchPoolHarness pool,) = _deployConfiguredPool(
            DEFAULT_VIRTUAL_USDC_RESERVE,
            SELL_TEST_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
        LibrARCToken token = LibrARCToken(address(pool.launchToken()));
        _fundPoolExact(pool, token);
        pool.initialize();

        pool.exposedSetAccountedState(
            SELL_TEST_REAL_USDC_RESERVE, SELL_TEST_REAL_TOKEN_RESERVE, 123, LaunchPool.PoolStatus.Active
        );
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 statusBefore = uint256(pool.status());

        usdcAmountIn = bound(usdcAmountIn, 1, 100_000);
        tokenAmountIn = bound(tokenAmountIn, 2 ether, 10 ether);

        pool.quoteBuy(usdcAmountIn);
        pool.quoteSell(tokenAmountIn);

        BondingCurveMath.CurveState memory stateAfter = pool.curveState();
        assertEq(uint256(pool.status()), statusBefore);
        _assertCurveStateEq(stateBefore, stateAfter);
    }

    function testFuzz_QuoteOutputsNeverExceedRealReserves(uint256 usdcAmountIn, uint256 tokenAmountIn) public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, SELL_TEST_VIRTUAL_TOKEN_RESERVE, 0, 0, 10_000_000);
        _fundPoolExact(pool, token);
        pool.initialize();

        uint256 realUsdcReserve = SELL_TEST_REAL_USDC_RESERVE;
        uint256 realTokenReserve = SELL_TEST_REAL_TOKEN_RESERVE;
        pool.exposedSetAccountedState(realUsdcReserve, realTokenReserve, 0, LaunchPool.PoolStatus.Active);

        usdcAmountIn = bound(usdcAmountIn, 1, 1_000_000);
        tokenAmountIn = bound(tokenAmountIn, 2 ether, realTokenReserve / 10);

        (BondingCurveMath.BuyQuote memory buyQuote,) = pool.quoteBuy(usdcAmountIn);
        BondingCurveMath.SellQuote memory sellQuote = pool.quoteSell(tokenAmountIn);

        assertLe(buyQuote.tokenAmountOut, realTokenReserve);
        assertLe(sellQuote.grossUsdcAmountOut, realUsdcReserve);
    }

    function testFuzz_RemainingGraduationCapacityNeverUnderflows(uint256 realUsdcReserve) public {
        (LaunchPoolHarness pool,) = _deployDefaultPool();
        realUsdcReserve = bound(realUsdcReserve, 0, DEFAULT_GRADUATION_THRESHOLD);

        pool.exposedSetAccountedState(realUsdcReserve, 0, type(uint128).max, LaunchPool.PoolStatus.Active);

        assertEq(pool.remainingGraduationCapacity(), DEFAULT_GRADUATION_THRESHOLD - realUsdcReserve);
    }

    function _deployDefaultPool() internal returns (LaunchPoolHarness pool, LibrARCToken token) {
        return _deployConfiguredPool(
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function _deployConfiguredPool(
        uint256 virtualUsdcReserve,
        uint256 virtualTokenReserve,
        uint256 buyFeeBps,
        uint256 sellFeeBps,
        uint256 graduationThreshold
    ) internal returns (LaunchPoolHarness pool, LibrARCToken token) {
        token = new LibrARCToken("LibrARC", "LARC", address(this));
        pool = _deployPool(
            address(token),
            token.FIXED_SUPPLY(),
            virtualUsdcReserve,
            virtualTokenReserve,
            buyFeeBps,
            sellFeeBps,
            graduationThreshold
        );
    }

    function _deployPool(
        address launchTokenAddress,
        uint256 totalTokenSupply,
        uint256 virtualUsdcReserve,
        uint256 virtualTokenReserve,
        uint256 buyFeeBps,
        uint256 sellFeeBps,
        uint256 graduationThreshold
    ) internal returns (LaunchPoolHarness pool) {
        pool = new LaunchPoolHarness(
            address(this),
            launchTokenAddress,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            totalTokenSupply,
            virtualUsdcReserve,
            virtualTokenReserve,
            buyFeeBps,
            sellFeeBps,
            graduationThreshold
        );
    }

    function _fundPoolExact(LaunchPoolHarness pool, LibrARCToken token) internal {
        assertTrue(token.transfer(address(pool), token.FIXED_SUPPLY()));
    }

    function _revertSelector(bytes memory revertData) internal pure returns (bytes4 selector) {
        if (revertData.length < 4) {
            return bytes4(0);
        }

        assembly ("memory-safe") {
            selector := mload(add(revertData, 0x20))
        }
    }

    function _assertCurveStateEq(BondingCurveMath.CurveState memory left, BondingCurveMath.CurveState memory right)
        internal
        pure
    {
        assertEq(left.realUsdcReserve, right.realUsdcReserve);
        assertEq(left.realTokenReserve, right.realTokenReserve);
        assertEq(left.virtualUsdcReserve, right.virtualUsdcReserve);
        assertEq(left.virtualTokenReserve, right.virtualTokenReserve);
        assertEq(left.accruedProtocolFees, right.accruedProtocolFees);
    }

    function _assertBuyQuoteEq(BondingCurveMath.BuyQuote memory left, BondingCurveMath.BuyQuote memory right)
        internal
        pure
    {
        assertEq(left.fee, right.fee);
        assertEq(left.netUsdcIn, right.netUsdcIn);
        assertEq(left.tokenAmountOut, right.tokenAmountOut);
        _assertCurveStateEq(left.nextState, right.nextState);
    }
}
