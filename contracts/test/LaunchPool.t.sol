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

contract MockConfigurableToken is ERC20 {
    uint8 private immutable _tokenDecimals;
    bool private _failTransfer;
    bool private _failTransferFrom;

    constructor(string memory name_, string memory symbol_, uint8 tokenDecimals_) ERC20(name_, symbol_) {
        _tokenDecimals = tokenDecimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfer(bool failTransfer_) external {
        _failTransfer = failTransfer_;
    }

    function setFailTransferFrom(bool failTransferFrom_) external {
        _failTransferFrom = failTransferFrom_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (_failTransfer) {
            return false;
        }

        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (_failTransferFrom) {
            return false;
        }

        return super.transferFrom(from, to, value);
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
    event BuyExecuted(
        address indexed buyer,
        address indexed recipient,
        uint256 usdcAmountIn,
        uint256 fee,
        uint256 netUsdcIn,
        uint256 tokenAmountOut,
        uint256 realUsdcReserve,
        uint256 realTokenReserve
    );
    event SellExecuted(
        address indexed seller,
        address indexed recipient,
        uint256 tokenAmountIn,
        uint256 grossUsdcAmountOut,
        uint256 fee,
        uint256 netUsdcAmountOut,
        uint256 realUsdcReserve,
        uint256 realTokenReserve
    );
    event GraduationPendingEntered(uint256 realUsdcReserve, uint256 graduationThreshold);

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);
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

    function test_BuyExecutesSuccessfulZeroFeeTradeAndUpdatesAccounting() public {
        uint256 buyAmountIn = 100_000;
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 1_000_000_000);
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(buyAmountIn);

        uint256 tokenAmountOut = _buyFromPool(pool, ALICE, buyAmountIn, quote.tokenAmountOut, block.timestamp, ALICE);

        assertEq(tokenAmountOut, quote.tokenAmountOut);
        assertEq(token.balanceOf(ALICE), quote.tokenAmountOut);
        assertEq(quoteAsset.balanceOf(address(pool)), buyAmountIn);
        _assertCurveStateEq(pool.curveState(), quote.nextState);
        assertEq(pool.curveState().accruedProtocolFees, 0);
        _assertPoolSolvency(pool);
    }

    function test_BuyExecutesFeeBearingTradeAndEmitsEvent() public {
        uint256 buyAmountIn = 100_000;
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(buyAmountIn);

        _mintAndApproveQuoteAsset(ALICE, buyAmountIn, pool);

        vm.expectEmit(true, true, false, true, address(pool));
        emit BuyExecuted(
            ALICE,
            ALICE,
            buyAmountIn,
            quote.fee,
            quote.netUsdcIn,
            quote.tokenAmountOut,
            quote.nextState.realUsdcReserve,
            quote.nextState.realTokenReserve
        );

        vm.prank(ALICE);
        uint256 tokenAmountOut = pool.buy(buyAmountIn, quote.tokenAmountOut, block.timestamp, ALICE);

        assertEq(tokenAmountOut, quote.tokenAmountOut);
        assertEq(token.balanceOf(ALICE), quote.tokenAmountOut);
        assertEq(quoteAsset.balanceOf(address(pool)), buyAmountIn);
        _assertCurveStateEq(pool.curveState(), quote.nextState);
        assertEq(pool.curveState().realUsdcReserve, quote.netUsdcIn);
        assertEq(pool.curveState().realTokenReserve, token.FIXED_SUPPLY() - quote.tokenAmountOut);
        assertEq(pool.curveState().accruedProtocolFees, quote.fee);
        _assertPoolSolvency(pool);
    }

    function test_BuySupportsAlternateRecipient() public {
        uint256 buyAmountIn = 75_000;
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(buyAmountIn);

        uint256 tokenAmountOut = _buyFromPool(pool, ALICE, buyAmountIn, quote.tokenAmountOut, block.timestamp, CAROL);

        assertEq(tokenAmountOut, quote.tokenAmountOut);
        assertEq(token.balanceOf(CAROL), quote.tokenAmountOut);
        assertEq(token.balanceOf(ALICE), 0);
        _assertPoolSolvency(pool);
    }

    function test_BuyForFactoryUnauthorizedCallerReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        vm.prank(OTHER_ACCOUNT);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.UnauthorizedFactory.selector, OTHER_ACCOUNT, address(this)));
        pool.buyForFactory(ALICE, 1, 0, block.timestamp, ALICE);
    }

    function test_BuyForFactoryExecutesNormalBuyPathForCreatorRecipientAndFactoryPayer() public {
        uint256 buyAmountIn = 100_000;
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(buyAmountIn);
        uint256 factoryQuoteBefore = quoteAsset.balanceOf(address(this));
        uint256 poolQuoteBefore = quoteAsset.balanceOf(address(pool));

        quoteAsset.mint(address(this), buyAmountIn);
        quoteAsset.approve(address(pool), buyAmountIn);

        vm.expectEmit(true, true, false, true, address(pool));
        emit BuyExecuted(
            ALICE,
            CAROL,
            buyAmountIn,
            quote.fee,
            quote.netUsdcIn,
            quote.tokenAmountOut,
            quote.nextState.realUsdcReserve,
            quote.nextState.realTokenReserve
        );

        uint256 tokenAmountOut = pool.buyForFactory(ALICE, buyAmountIn, quote.tokenAmountOut, block.timestamp, CAROL);

        assertEq(tokenAmountOut, quote.tokenAmountOut);
        assertEq(quoteAsset.balanceOf(address(this)), factoryQuoteBefore);
        assertEq(quoteAsset.balanceOf(address(pool)), poolQuoteBefore + buyAmountIn);
        assertEq(token.balanceOf(CAROL), quote.tokenAmountOut);
        assertEq(token.balanceOf(ALICE), 0);
        _assertCurveStateEq(pool.curveState(), quote.nextState);
        _assertPoolSolvency(pool);
    }

    function test_BuyForFactoryUsesSameQuoteAsPublicBuyFromEquivalentState() public {
        uint256 buyAmountIn = 80_000;
        (LaunchPoolHarness factoryPool, LibrARCToken factoryToken) = _deployDefaultPool();
        _fundPoolExact(factoryPool, factoryToken);
        factoryPool.initialize();

        (LaunchPoolHarness publicPool, LibrARCToken publicToken) = _deployDefaultPool();
        _fundPoolExact(publicPool, publicToken);
        publicPool.initialize();

        (BondingCurveMath.BuyQuote memory expectedQuote,) = factoryPool.quoteBuy(buyAmountIn);
        uint256 factoryTokenAmountOut =
            _buyFromFactory(factoryPool, ALICE, buyAmountIn, expectedQuote.tokenAmountOut, block.timestamp, CAROL);
        uint256 publicTokenAmountOut =
            _buyFromPool(publicPool, ALICE, buyAmountIn, expectedQuote.tokenAmountOut, block.timestamp, CAROL);

        assertEq(factoryTokenAmountOut, expectedQuote.tokenAmountOut);
        assertEq(publicTokenAmountOut, expectedQuote.tokenAmountOut);
        _assertCurveStateEq(factoryPool.curveState(), publicPool.curveState());
    }

    function test_BuyForFactoryZeroBuyerReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();
        quoteAsset.mint(address(this), 1);
        quoteAsset.approve(address(pool), 1);

        vm.expectRevert(LaunchPool.ZeroBuyer.selector);
        pool.buyForFactory(address(0), 1, 0, block.timestamp, ALICE);
    }

    function test_BuyZeroRecipientReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();
        _mintAndApproveQuoteAsset(ALICE, 1, pool);

        vm.prank(ALICE);
        vm.expectRevert(LaunchPool.ZeroRecipient.selector);
        pool.buy(1, 0, block.timestamp, address(0));
    }

    function test_BuyForFactoryZeroRecipientReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();
        quoteAsset.mint(address(this), 1);
        quoteAsset.approve(address(pool), 1);

        vm.expectRevert(LaunchPool.ZeroRecipient.selector);
        pool.buyForFactory(ALICE, 1, 0, block.timestamp, address(0));
    }

    function test_BuyZeroInputReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        vm.prank(ALICE);
        vm.expectRevert(BondingCurveMath.ZeroInput.selector);
        pool.buy(0, 0, block.timestamp, ALICE);
    }

    function test_BuyExpiredDeadlineReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();
        _mintAndApproveQuoteAsset(ALICE, 1, pool);

        vm.warp(100);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.ExpiredDeadline.selector, uint256(100), uint256(99)));
        pool.buy(1, 0, 99, ALICE);
    }

    function test_BuyForFactoryExpiredDeadlineReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();
        quoteAsset.mint(address(this), 1);
        quoteAsset.approve(address(pool), 1);

        vm.warp(100);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.ExpiredDeadline.selector, uint256(100), uint256(99)));
        pool.buyForFactory(ALICE, 1, 0, 99, ALICE);
    }

    function test_BuySlippageFailureRevertsWithoutStateChanges() public {
        uint256 buyAmountIn = 50_000;
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(buyAmountIn);
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolUsdcBefore = quoteAsset.balanceOf(address(pool));
        uint256 poolTokenBefore = token.balanceOf(address(pool));

        _mintAndApproveQuoteAsset(ALICE, buyAmountIn, pool);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.InsufficientTokenOutput.selector, quote.tokenAmountOut + 1, quote.tokenAmountOut
            )
        );
        pool.buy(buyAmountIn, quote.tokenAmountOut + 1, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteAsset.balanceOf(address(pool)), poolUsdcBefore);
        assertEq(token.balanceOf(address(pool)), poolTokenBefore);
        assertEq(token.balanceOf(ALICE), 0);
    }

    function test_BuyForFactorySlippageFailureRevertsWithoutStateChanges() public {
        uint256 buyAmountIn = 50_000;
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(buyAmountIn);
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 factoryQuoteBefore = quoteAsset.balanceOf(address(this));
        uint256 poolUsdcBefore = quoteAsset.balanceOf(address(pool));
        uint256 poolTokenBefore = token.balanceOf(address(pool));

        quoteAsset.mint(address(this), buyAmountIn);
        quoteAsset.approve(address(pool), buyAmountIn);

        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.InsufficientTokenOutput.selector, quote.tokenAmountOut + 1, quote.tokenAmountOut
            )
        );
        pool.buyForFactory(ALICE, buyAmountIn, quote.tokenAmountOut + 1, block.timestamp, CAROL);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteAsset.balanceOf(address(this)), factoryQuoteBefore + buyAmountIn);
        assertEq(quoteAsset.balanceOf(address(pool)), poolUsdcBefore);
        assertEq(token.balanceOf(address(pool)), poolTokenBefore);
        assertEq(token.balanceOf(CAROL), 0);
    }

    function test_BuyMissingAllowanceReverts() public {
        uint256 buyAmountIn = 25_000;
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();
        quoteAsset.mint(ALICE, buyAmountIn);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(pool), 0, buyAmountIn)
        );
        pool.buy(buyAmountIn, 0, block.timestamp, ALICE);
    }

    function test_BuyInsufficientUsdcBalanceReverts() public {
        uint256 buyAmountIn = 25_000;
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        vm.prank(ALICE);
        quoteAsset.approve(address(pool), buyAmountIn);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, ALICE, uint256(0), buyAmountIn)
        );
        pool.buy(buyAmountIn, 0, block.timestamp, ALICE);
    }

    function test_BuyThresholdEqualitySucceedsAndEntersGraduationPending() public {
        uint256 threshold = 1000;
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, threshold);
        _fundPoolExact(pool, token);
        pool.initialize();

        (BondingCurveMath.BuyQuote memory quote, bool reachesGraduationThreshold) = pool.quoteBuy(threshold);
        assertTrue(reachesGraduationThreshold);

        _mintAndApproveQuoteAsset(ALICE, threshold, pool);

        vm.expectEmit(true, true, false, true, address(pool));
        emit BuyExecuted(
            ALICE,
            ALICE,
            threshold,
            quote.fee,
            quote.netUsdcIn,
            quote.tokenAmountOut,
            quote.nextState.realUsdcReserve,
            quote.nextState.realTokenReserve
        );
        vm.expectEmit(false, false, false, true, address(pool));
        emit GraduationPendingEntered(threshold, threshold);

        vm.prank(ALICE);
        uint256 tokenAmountOut = pool.buy(threshold, quote.tokenAmountOut, block.timestamp, ALICE);

        assertEq(tokenAmountOut, quote.tokenAmountOut);
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.GraduationPending));
        assertFalse(pool.isTradingActive());
        _assertCurveStateEq(pool.curveState(), quote.nextState);
    }

    function test_BuyThresholdOvershootRevertsWithoutMutation() public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 999);
        _fundPoolExact(pool, token);
        pool.initialize();

        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolUsdcBefore = quoteAsset.balanceOf(address(pool));
        uint256 poolTokenBefore = token.balanceOf(address(pool));
        uint256 buyerUsdcBefore = 1000;

        _mintAndApproveQuoteAsset(ALICE, buyerUsdcBefore, pool);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.GraduationThresholdExceeded.selector, uint256(0), uint256(1000), 999)
        );
        pool.buy(1000, 1, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
        assertEq(quoteAsset.balanceOf(address(pool)), poolUsdcBefore);
        assertEq(token.balanceOf(address(pool)), poolTokenBefore);
        assertEq(quoteAsset.balanceOf(ALICE), buyerUsdcBefore);
        assertEq(token.balanceOf(ALICE), 0);
    }

    function test_BuyForFactoryThresholdOvershootRevertsWithoutMutation() public {
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, 999);
        _fundPoolExact(pool, token);
        pool.initialize();

        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolUsdcBefore = quoteAsset.balanceOf(address(pool));
        uint256 poolTokenBefore = token.balanceOf(address(pool));
        uint256 factoryQuoteBefore = quoteAsset.balanceOf(address(this));

        quoteAsset.mint(address(this), 1000);
        quoteAsset.approve(address(pool), 1000);

        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.GraduationThresholdExceeded.selector, uint256(0), uint256(1000), 999)
        );
        pool.buyForFactory(ALICE, 1000, 1, block.timestamp, CAROL);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
        assertEq(quoteAsset.balanceOf(address(this)), factoryQuoteBefore + 1000);
        assertEq(quoteAsset.balanceOf(address(pool)), poolUsdcBefore);
        assertEq(token.balanceOf(address(pool)), poolTokenBefore);
        assertEq(token.balanceOf(CAROL), 0);
    }

    function test_BuyWhileNotActiveReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Uninitialized));
        pool.buy(1, 0, block.timestamp, ALICE);

        _fundPoolExact(pool, token);
        pool.initialize();
        pool.exposedSetAccountedState(0, token.FIXED_SUPPLY(), 0, LaunchPool.PoolStatus.GraduationPending);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.GraduationPending)
        );
        pool.buy(1, 0, block.timestamp, ALICE);

        pool.exposedSetAccountedState(0, token.FIXED_SUPPLY(), 0, LaunchPool.PoolStatus.Graduated);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Graduated));
        pool.buy(1, 0, block.timestamp, ALICE);
    }

    function test_SellExecutesSuccessfulZeroFeeTradeAndUpdatesAccounting() public {
        (LaunchPoolHarness pool, LibrARCToken token, uint256 boughtTokens) = _prepareSellFixture(0, 0, 100_000);
        uint256 sellAmount = boughtTokens / 2;
        BondingCurveMath.SellQuote memory quote = pool.quoteSell(sellAmount);

        vm.prank(ALICE);
        token.approve(address(pool), sellAmount);

        vm.prank(ALICE);
        uint256 netUsdcAmountOut = pool.sell(sellAmount, quote.netUsdcAmountOut, block.timestamp, ALICE);

        assertEq(netUsdcAmountOut, quote.netUsdcAmountOut);
        assertEq(netUsdcAmountOut, quote.grossUsdcAmountOut);
        assertEq(quoteAsset.balanceOf(ALICE), netUsdcAmountOut);
        assertEq(token.balanceOf(ALICE), boughtTokens - sellAmount);
        _assertCurveStateEq(pool.curveState(), quote.nextState);
        assertEq(quoteAsset.balanceOf(address(pool)), 100_000 - netUsdcAmountOut);
        assertEq(token.balanceOf(address(pool)), token.FIXED_SUPPLY() - boughtTokens + sellAmount);
        _assertPoolSolvency(pool);
    }

    function test_SellExecutesFeeBearingTradeAndEmitsEvent() public {
        (LaunchPoolHarness pool, LibrARCToken token, uint256 boughtTokens) =
            _prepareSellFixture(DEFAULT_BUY_FEE_BPS, DEFAULT_SELL_FEE_BPS, 100_000);
        uint256 sellAmount = boughtTokens / 2;
        BondingCurveMath.SellQuote memory quote = pool.quoteSell(sellAmount);

        vm.prank(ALICE);
        token.approve(address(pool), sellAmount);

        vm.expectEmit(true, true, false, true, address(pool));
        emit SellExecuted(
            ALICE,
            ALICE,
            sellAmount,
            quote.grossUsdcAmountOut,
            quote.fee,
            quote.netUsdcAmountOut,
            quote.nextState.realUsdcReserve,
            quote.nextState.realTokenReserve
        );

        vm.prank(ALICE);
        uint256 netUsdcAmountOut = pool.sell(sellAmount, quote.netUsdcAmountOut, block.timestamp, ALICE);

        assertEq(netUsdcAmountOut, quote.netUsdcAmountOut);
        assertEq(quoteAsset.balanceOf(ALICE), netUsdcAmountOut);
        _assertCurveStateEq(pool.curveState(), quote.nextState);
        assertEq(pool.curveState().accruedProtocolFees, quote.nextState.accruedProtocolFees);
        _assertPoolSolvency(pool);
    }

    function test_SellSupportsAlternateRecipient() public {
        (LaunchPoolHarness pool, LibrARCToken token, uint256 boughtTokens) = _prepareSellFixture(0, 0, 100_000);
        uint256 sellAmount = boughtTokens / 2;
        BondingCurveMath.SellQuote memory quote = pool.quoteSell(sellAmount);

        vm.prank(ALICE);
        token.approve(address(pool), sellAmount);

        vm.prank(ALICE);
        uint256 netUsdcAmountOut = pool.sell(sellAmount, quote.netUsdcAmountOut, block.timestamp, CAROL);

        assertEq(netUsdcAmountOut, quote.netUsdcAmountOut);
        assertEq(quoteAsset.balanceOf(CAROL), netUsdcAmountOut);
        assertEq(quoteAsset.balanceOf(ALICE), 0);
    }

    function test_SellZeroRecipientReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token, uint256 boughtTokens) = _prepareSellFixture(0, 0, 100_000);

        vm.prank(ALICE);
        token.approve(address(pool), boughtTokens);

        vm.prank(ALICE);
        vm.expectRevert(LaunchPool.ZeroRecipient.selector);
        pool.sell(boughtTokens, 0, block.timestamp, address(0));
    }

    function test_SellZeroInputReverts() public {
        (LaunchPoolHarness pool,,) = _prepareSellFixture(0, 0, 100_000);

        vm.prank(ALICE);
        vm.expectRevert(BondingCurveMath.ZeroInput.selector);
        pool.sell(0, 0, block.timestamp, ALICE);
    }

    function test_SellExpiredDeadlineReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token, uint256 boughtTokens) = _prepareSellFixture(0, 0, 100_000);

        vm.prank(ALICE);
        token.approve(address(pool), boughtTokens);

        vm.warp(200);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.ExpiredDeadline.selector, uint256(200), uint256(199)));
        pool.sell(boughtTokens, 0, 199, ALICE);
    }

    function test_SellSlippageFailureRevertsWithoutStateChanges() public {
        (LaunchPoolHarness pool, LibrARCToken token, uint256 boughtTokens) = _prepareSellFixture(0, 0, 100_000);
        uint256 sellAmount = boughtTokens / 2;
        BondingCurveMath.SellQuote memory quote = pool.quoteSell(sellAmount);
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolUsdcBefore = quoteAsset.balanceOf(address(pool));
        uint256 poolTokenBefore = token.balanceOf(address(pool));
        uint256 sellerTokenBefore = token.balanceOf(ALICE);

        vm.prank(ALICE);
        token.approve(address(pool), sellAmount);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.InsufficientUsdcOutput.selector, quote.netUsdcAmountOut + 1, quote.netUsdcAmountOut
            )
        );
        pool.sell(sellAmount, quote.netUsdcAmountOut + 1, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteAsset.balanceOf(address(pool)), poolUsdcBefore);
        assertEq(token.balanceOf(address(pool)), poolTokenBefore);
        assertEq(token.balanceOf(ALICE), sellerTokenBefore);
        assertEq(quoteAsset.balanceOf(ALICE), 0);
    }

    function test_SellMissingAllowanceReverts() public {
        (LaunchPoolHarness pool,, uint256 boughtTokens) = _prepareSellFixture(0, 0, 100_000);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(pool), 0, boughtTokens)
        );
        pool.sell(boughtTokens, 0, block.timestamp, ALICE);
    }

    function test_SellInsufficientTokenBalanceReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token, uint256 boughtTokens) = _prepareSellFixture(0, 0, 100_000);
        uint256 transferredAway = boughtTokens / 2;

        vm.prank(ALICE);
        assertTrue(token.transfer(BOB, transferredAway));

        vm.prank(ALICE);
        token.approve(address(pool), boughtTokens);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, ALICE, boughtTokens - transferredAway, boughtTokens
            )
        );
        pool.sell(boughtTokens, 0, block.timestamp, ALICE);
    }

    function test_SellInsufficientRealUsdcReserveReverts() public {
        uint256 totalSupply_ = 1_000_000 ether;
        uint256 traderTokenAmount = 2 ether;
        (LaunchPoolHarness pool, MockConfigurableToken launchToken_, MockConfigurableToken quoteToken_) =
            _deployFailingPool(18, 6, totalSupply_);
        _seedCustomSellState(pool, launchToken_, quoteToken_, totalSupply_, traderTokenAmount, 0, 0);

        vm.prank(ALICE);
        vm.expectRevert(BondingCurveMath.InsufficientRealUsdcReserve.selector);
        pool.sell(traderTokenAmount, 0, block.timestamp, ALICE);
    }

    function test_SellWhileNotActiveReverts() public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Uninitialized));
        pool.sell(1, 0, block.timestamp, ALICE);

        _fundPoolExact(pool, token);
        pool.initialize();
        pool.exposedSetAccountedState(0, token.FIXED_SUPPLY(), 0, LaunchPool.PoolStatus.GraduationPending);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.GraduationPending)
        );
        pool.sell(1, 0, block.timestamp, ALICE);

        pool.exposedSetAccountedState(0, token.FIXED_SUPPLY(), 0, LaunchPool.PoolStatus.Graduated);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(LaunchPool.PoolNotActive.selector, LaunchPool.PoolStatus.Graduated));
        pool.sell(1, 0, block.timestamp, ALICE);
    }

    function test_FailedUsdcTransferFromLeavesBuyStateUnchanged() public {
        uint256 totalSupply_ = 1_000_000 ether;
        (LaunchPoolHarness pool, MockConfigurableToken launchToken_, MockConfigurableToken quoteToken_) =
            _deployFailingPool(18, 6, totalSupply_);
        _fundCustomPoolExact(pool, launchToken_, totalSupply_);
        pool.initialize();

        quoteToken_.mint(ALICE, 100_000);
        vm.prank(ALICE);
        quoteToken_.approve(address(pool), 100_000);
        quoteToken_.setFailTransferFrom(true);

        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolQuoteBefore = quoteToken_.balanceOf(address(pool));
        uint256 poolTokenBefore = launchToken_.balanceOf(address(pool));
        uint256 buyerQuoteBefore = quoteToken_.balanceOf(ALICE);

        vm.prank(ALICE);
        vm.expectRevert();
        pool.buy(100_000, 1, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteToken_.balanceOf(address(pool)), poolQuoteBefore);
        assertEq(launchToken_.balanceOf(address(pool)), poolTokenBefore);
        assertEq(quoteToken_.balanceOf(ALICE), buyerQuoteBefore);
        assertEq(launchToken_.balanceOf(ALICE), 0);
    }

    function test_FailedOutgoingTokenTransferLeavesBuyStateUnchanged() public {
        uint256 totalSupply_ = 1_000_000 ether;
        (LaunchPoolHarness pool, MockConfigurableToken launchToken_, MockConfigurableToken quoteToken_) =
            _deployFailingPool(18, 6, totalSupply_);
        _fundCustomPoolExact(pool, launchToken_, totalSupply_);
        pool.initialize();

        quoteToken_.mint(ALICE, 100_000);
        vm.prank(ALICE);
        quoteToken_.approve(address(pool), 100_000);
        launchToken_.setFailTransfer(true);

        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolQuoteBefore = quoteToken_.balanceOf(address(pool));
        uint256 poolTokenBefore = launchToken_.balanceOf(address(pool));
        uint256 buyerQuoteBefore = quoteToken_.balanceOf(ALICE);

        vm.prank(ALICE);
        vm.expectRevert();
        pool.buy(100_000, 1, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteToken_.balanceOf(address(pool)), poolQuoteBefore);
        assertEq(launchToken_.balanceOf(address(pool)), poolTokenBefore);
        assertEq(quoteToken_.balanceOf(ALICE), buyerQuoteBefore);
        assertEq(launchToken_.balanceOf(ALICE), 0);
    }

    function test_FailedTokenTransferFromLeavesSellStateUnchanged() public {
        uint256 totalSupply_ = 1_000_000 ether;
        uint256 traderTokenAmount = 10_000 ether;
        (LaunchPoolHarness pool, MockConfigurableToken launchToken_, MockConfigurableToken quoteToken_) =
            _deployFailingPool(18, 6, totalSupply_);
        _seedCustomSellState(pool, launchToken_, quoteToken_, totalSupply_, traderTokenAmount, 500_000, 10_000);
        launchToken_.setFailTransferFrom(true);

        BondingCurveMath.SellQuote memory quote = pool.quoteSell(traderTokenAmount / 2);
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolQuoteBefore = quoteToken_.balanceOf(address(pool));
        uint256 poolTokenBefore = launchToken_.balanceOf(address(pool));
        uint256 sellerTokenBefore = launchToken_.balanceOf(ALICE);

        vm.prank(ALICE);
        vm.expectRevert();
        pool.sell(traderTokenAmount / 2, quote.netUsdcAmountOut, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteToken_.balanceOf(address(pool)), poolQuoteBefore);
        assertEq(launchToken_.balanceOf(address(pool)), poolTokenBefore);
        assertEq(launchToken_.balanceOf(ALICE), sellerTokenBefore);
        assertEq(quoteToken_.balanceOf(ALICE), 0);
    }

    function test_FailedOutgoingUsdcTransferLeavesSellStateUnchanged() public {
        uint256 totalSupply_ = 1_000_000 ether;
        uint256 traderTokenAmount = 10_000 ether;
        (LaunchPoolHarness pool, MockConfigurableToken launchToken_, MockConfigurableToken quoteToken_) =
            _deployFailingPool(18, 6, totalSupply_);
        _seedCustomSellState(pool, launchToken_, quoteToken_, totalSupply_, traderTokenAmount, 500_000, 10_000);
        quoteToken_.setFailTransfer(true);

        BondingCurveMath.SellQuote memory quote = pool.quoteSell(traderTokenAmount / 2);
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolQuoteBefore = quoteToken_.balanceOf(address(pool));
        uint256 poolTokenBefore = launchToken_.balanceOf(address(pool));
        uint256 sellerTokenBefore = launchToken_.balanceOf(ALICE);

        vm.prank(ALICE);
        vm.expectRevert();
        pool.sell(traderTokenAmount / 2, quote.netUsdcAmountOut, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteToken_.balanceOf(address(pool)), poolQuoteBefore);
        assertEq(launchToken_.balanceOf(address(pool)), poolTokenBefore);
        assertEq(launchToken_.balanceOf(ALICE), sellerTokenBefore);
        assertEq(quoteToken_.balanceOf(ALICE), 0);
    }

    function test_DonationsDoNotChangeGraduationCapacity() public {
        SurplusBalanceToken token = new SurplusBalanceToken(address(this), 1_000_000 ether);
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
        pool.exposedSetAccountedState(123_456, 900_000 ether, 789, LaunchPool.PoolStatus.Active);

        uint256 capacityBefore = pool.remainingGraduationCapacity();

        quoteAsset.mint(address(pool), 1_000_000);
        token.setPoolBalanceBonus(address(pool), 500 ether);

        assertEq(pool.remainingGraduationCapacity(), capacityBefore);
    }

    function testFuzz_SuccessfulBuysBelowGraduationCapacityMatchQuotes(uint256 usdcAmountIn) public {
        uint256 threshold = 1_000_000;
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, threshold);
        _fundPoolExact(pool, token);
        pool.initialize();

        usdcAmountIn = bound(usdcAmountIn, 1, threshold);

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(usdcAmountIn);
        uint256 tokenAmountOut = _buyFromPool(pool, ALICE, usdcAmountIn, quote.tokenAmountOut, block.timestamp, ALICE);

        assertEq(tokenAmountOut, quote.tokenAmountOut);
        _assertCurveStateEq(pool.curveState(), quote.nextState);
        _assertPoolSolvency(pool);
    }

    function testFuzz_SuccessfulSellsMatchQuotesAndPreserveSolvency(uint256 buyAmountIn, uint256 sellAmountIn) public {
        buyAmountIn = bound(buyAmountIn, 10_000, 1_000_000);

        uint256 totalSupply_ = 1_000_000 ether;
        MockConfigurableToken launchToken_ = new MockConfigurableToken("Launch Token", "LCH", 18);
        launchToken_.mint(address(this), totalSupply_);

        LaunchPoolHarness pool = _deployPool(
            address(launchToken_),
            totalSupply_,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            SELL_TEST_VIRTUAL_TOKEN_RESERVE,
            0,
            0,
            DEFAULT_GRADUATION_THRESHOLD
        );
        _fundCustomPoolExact(pool, launchToken_, totalSupply_);
        pool.initialize();

        uint256 boughtTokens = _buyFromPool(pool, ALICE, buyAmountIn, 1, block.timestamp, ALICE);

        sellAmountIn = bound(sellAmountIn, 2 ether, boughtTokens);
        BondingCurveMath.SellQuote memory quote = pool.quoteSell(sellAmountIn);

        vm.prank(ALICE);
        launchToken_.approve(address(pool), sellAmountIn);

        vm.prank(ALICE);
        uint256 netUsdcAmountOut = pool.sell(sellAmountIn, quote.netUsdcAmountOut, block.timestamp, ALICE);

        assertEq(netUsdcAmountOut, quote.netUsdcAmountOut);
        _assertCurveStateEq(pool.curveState(), quote.nextState);
        assertLe(pool.curveState().realTokenReserve, totalSupply_);
        _assertPoolSolvency(pool);
    }

    function testFuzz_FailedSlippageBuysNeverMutateState(uint256 usdcAmountIn) public {
        (LaunchPoolHarness pool, LibrARCToken token) = _deployDefaultPool();
        _fundPoolExact(pool, token);
        pool.initialize();

        usdcAmountIn = bound(usdcAmountIn, 1, 100_000);

        (BondingCurveMath.BuyQuote memory quote,) = pool.quoteBuy(usdcAmountIn);
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolUsdcBefore = quoteAsset.balanceOf(address(pool));
        uint256 poolTokenBefore = token.balanceOf(address(pool));

        _mintAndApproveQuoteAsset(ALICE, usdcAmountIn, pool);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.InsufficientTokenOutput.selector, quote.tokenAmountOut + 1, quote.tokenAmountOut
            )
        );
        pool.buy(usdcAmountIn, quote.tokenAmountOut + 1, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(quoteAsset.balanceOf(address(pool)), poolUsdcBefore);
        assertEq(token.balanceOf(address(pool)), poolTokenBefore);
    }

    function testFuzz_ThresholdCrossingBuysNeverMutateState(uint256 usdcAmountIn) public {
        uint256 threshold = 50_000;
        (LaunchPoolHarness pool, LibrARCToken token) =
            _deployConfiguredPool(DEFAULT_VIRTUAL_USDC_RESERVE, DEFAULT_VIRTUAL_TOKEN_RESERVE, 0, 0, threshold);
        _fundPoolExact(pool, token);
        pool.initialize();

        usdcAmountIn = bound(usdcAmountIn, threshold + 1, threshold * 2);

        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 poolUsdcBefore = quoteAsset.balanceOf(address(pool));
        uint256 poolTokenBefore = token.balanceOf(address(pool));

        _mintAndApproveQuoteAsset(ALICE, usdcAmountIn, pool);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.GraduationThresholdExceeded.selector, uint256(0), usdcAmountIn, threshold)
        );
        pool.buy(usdcAmountIn, 1, block.timestamp, ALICE);

        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
        assertEq(quoteAsset.balanceOf(address(pool)), poolUsdcBefore);
        assertEq(token.balanceOf(address(pool)), poolTokenBefore);
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

    function _mintAndApproveQuoteAsset(address holder, uint256 amount, LaunchPoolHarness pool) internal {
        quoteAsset.mint(holder, amount);

        vm.prank(holder);
        quoteAsset.approve(address(pool), amount);
    }

    function _buyFromPool(
        LaunchPoolHarness pool,
        address buyer,
        uint256 usdcAmountIn,
        uint256 minTokenAmountOut,
        uint256 deadline,
        address recipient
    ) internal returns (uint256 tokenAmountOut) {
        _mintAndApproveQuoteAsset(buyer, usdcAmountIn, pool);

        vm.prank(buyer);
        tokenAmountOut = pool.buy(usdcAmountIn, minTokenAmountOut, deadline, recipient);
    }

    function _buyFromFactory(
        LaunchPoolHarness pool,
        address buyer,
        uint256 usdcAmountIn,
        uint256 minTokenAmountOut,
        uint256 deadline,
        address recipient
    ) internal returns (uint256 tokenAmountOut) {
        quoteAsset.mint(address(this), usdcAmountIn);
        quoteAsset.approve(address(pool), usdcAmountIn);
        tokenAmountOut = pool.buyForFactory(buyer, usdcAmountIn, minTokenAmountOut, deadline, recipient);
    }

    function _deployCustomPool(
        address launchTokenAddress,
        address quoteTokenAddress,
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
            quoteTokenAddress,
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

    function _prepareSellFixture(uint256 buyFeeBps, uint256 sellFeeBps, uint256 buyAmountIn)
        internal
        returns (LaunchPoolHarness pool, LibrARCToken token, uint256 tokenAmountOut)
    {
        (pool, token) = _deployConfiguredPool(
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            buyFeeBps,
            sellFeeBps,
            DEFAULT_GRADUATION_THRESHOLD
        );
        _fundPoolExact(pool, token);
        pool.initialize();

        tokenAmountOut = _buyFromPool(pool, ALICE, buyAmountIn, 1, block.timestamp, ALICE);
    }

    function _deployFailingPool(uint8 launchTokenDecimals, uint8 quoteTokenDecimals, uint256 totalTokenSupply)
        internal
        returns (LaunchPoolHarness pool, MockConfigurableToken launchToken_, MockConfigurableToken quoteToken_)
    {
        launchToken_ = new MockConfigurableToken("Launch Token", "LCH", launchTokenDecimals);
        quoteToken_ = new MockConfigurableToken("Arc USDC", "USDC", quoteTokenDecimals);
        launchToken_.mint(address(this), totalTokenSupply);

        pool = _deployCustomPool(
            address(launchToken_),
            address(quoteToken_),
            totalTokenSupply,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            SELL_TEST_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
    }

    function _fundCustomPoolExact(LaunchPoolHarness pool, MockConfigurableToken launchToken_, uint256 amount) internal {
        assertTrue(launchToken_.transfer(address(pool), amount));
    }

    function _seedCustomSellState(
        LaunchPoolHarness pool,
        MockConfigurableToken launchToken_,
        MockConfigurableToken quoteToken_,
        uint256 totalTokenSupply_,
        uint256 traderTokenAmount,
        uint256 realUsdcReserve,
        uint256 accruedProtocolFees
    ) internal {
        _fundCustomPoolExact(pool, launchToken_, totalTokenSupply_);
        pool.initialize();

        if (realUsdcReserve + accruedProtocolFees > 0) {
            quoteToken_.mint(address(pool), realUsdcReserve + accruedProtocolFees);
        }

        vm.prank(address(pool));
        assertTrue(launchToken_.transfer(ALICE, traderTokenAmount));

        pool.exposedSetAccountedState(
            realUsdcReserve, totalTokenSupply_ - traderTokenAmount, accruedProtocolFees, LaunchPool.PoolStatus.Active
        );

        vm.prank(ALICE);
        launchToken_.approve(address(pool), type(uint256).max);
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
        pool = _deployCustomPool(
            launchTokenAddress,
            address(quoteAsset),
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

    function _assertSellQuoteEq(BondingCurveMath.SellQuote memory left, BondingCurveMath.SellQuote memory right)
        internal
        pure
    {
        assertEq(left.fee, right.fee);
        assertEq(left.grossUsdcAmountOut, right.grossUsdcAmountOut);
        assertEq(left.netUsdcAmountOut, right.netUsdcAmountOut);
        _assertCurveStateEq(left.nextState, right.nextState);
    }

    function _assertPoolSolvency(LaunchPoolHarness pool) internal view {
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertGe(pool.quoteAsset().balanceOf(address(pool)), state.realUsdcReserve + state.accruedProtocolFees);
        assertGe(pool.launchToken().balanceOf(address(pool)), state.realTokenReserve);
    }
}
