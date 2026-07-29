// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {BondingCurveMath} from "../src/libraries/BondingCurveMath.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {ILiquidityAdapter} from "../src/interfaces/ILiquidityAdapter.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
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

contract FeeOnTransferQuoteAsset is ERC20 {
    uint256 internal constant TRANSFER_FEE_BPS = 100;
    address internal constant FEE_SINK = address(0xDEAD);

    constructor() ERC20("Arc USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        _transferWithFee(_msgSender(), to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _spendAllowance(from, _msgSender(), value);
        _transferWithFee(from, to, value);
        return true;
    }

    function _transferWithFee(address from, address to, uint256 value) internal {
        uint256 fee = value * TRANSFER_FEE_BPS / 10_000;
        uint256 netAmount = value - fee;

        _update(from, to, netAmount);
        if (fee > 0) {
            _update(from, FEE_SINK, fee);
        }
    }
}

contract LaunchFactoryTest is Test, IERC20Errors {
    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed launchToken,
        address launchPool,
        string name,
        string symbol,
        string metadataUri,
        bytes32 metadataHash
    );
    event CreatorInitialPurchaseExecuted(
        uint256 indexed launchId,
        address indexed creator,
        address indexed recipient,
        address launchPool,
        uint256 usdcAmountIn,
        uint256 tokenAmountOut
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
    event GraduationPendingEntered(uint256 realUsdcReserve, uint256 graduationThreshold);
    event PoolBuysPauseUpdated(address indexed pool, bool paused, address indexed caller);
    event PoolTradingPauseUpdated(address indexed pool, bool paused, address indexed caller);
    event BuysPauseUpdated(bool paused, address indexed factoryCaller);
    event AllTradingPauseUpdated(bool paused, address indexed factoryCaller);

    address internal constant INITIAL_ADMIN = address(0xA11CE);
    address internal constant CREATOR = address(0xBEEF);
    address internal constant OTHER_ACCOUNT = address(0xCAFE);
    address internal constant LIQUIDITY_RECIPIENT = address(0xF00D);

    uint48 internal constant ADMIN_TRANSFER_DELAY = 3 days;

    uint256 internal constant DEFAULT_VIRTUAL_USDC_RESERVE = 1_000_000;
    uint256 internal constant DEFAULT_VIRTUAL_TOKEN_RESERVE = 500_000_000 * 10 ** 18;
    uint256 internal constant DEFAULT_BUY_FEE_BPS = 250;
    uint256 internal constant DEFAULT_SELL_FEE_BPS = 300;
    uint256 internal constant DEFAULT_GRADUATION_THRESHOLD = 10_000_000;
    uint256 internal constant DEFAULT_MAX_METADATA_URI_LENGTH = 120;
    uint256 internal constant FIXED_SUPPLY = 1_000_000_000 * 10 ** 18;

    MockQuoteAsset internal quoteAsset;
    FeeVault internal feeVault;
    MockLiquidityAdapter internal liquidityAdapter;
    LaunchFactory internal factory;

    function setUp() public {
        quoteAsset = new MockQuoteAsset();
        feeVault = new FeeVault(address(this), address(this), 1);
        liquidityAdapter = new MockLiquidityAdapter();
        factory = _deployDefaultFactory();
    }

    function test_ConstructorStoresConfigurationAndRoles() public view {
        assertEq(factory.defaultAdmin(), INITIAL_ADMIN);
        assertEq(factory.defaultAdminDelay(), ADMIN_TRANSFER_DELAY);
        assertEq(factory.quoteAsset(), address(quoteAsset));
        assertEq(factory.feeVault(), address(feeVault));
        assertEq(factory.liquidityAdapter(), address(liquidityAdapter));
        assertEq(factory.liquidityRecipient(), LIQUIDITY_RECIPIENT);
        assertEq(factory.virtualUsdcReserve(), DEFAULT_VIRTUAL_USDC_RESERVE);
        assertEq(factory.virtualTokenReserve(), DEFAULT_VIRTUAL_TOKEN_RESERVE);
        assertEq(factory.buyFeeBps(), DEFAULT_BUY_FEE_BPS);
        assertEq(factory.sellFeeBps(), DEFAULT_SELL_FEE_BPS);
        assertEq(factory.graduationThreshold(), DEFAULT_GRADUATION_THRESHOLD);
        assertEq(factory.maxMetadataUriLength(), DEFAULT_MAX_METADATA_URI_LENGTH);
        assertTrue(factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), INITIAL_ADMIN));
        assertTrue(factory.hasRole(factory.PAUSER_ROLE(), INITIAL_ADMIN));
        assertFalse(factory.hasRole(factory.PAUSER_ROLE(), CREATOR));
    }

    function test_RevertWhenInitialAdminIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroAdmin.selector);
        _deployFactory(
            address(0),
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenAdminTransferDelayIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroAdminTransferDelay.selector);
        _deployFactory(
            INITIAL_ADMIN,
            0,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenQuoteAssetIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroQuoteAsset.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(0),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenFeeVaultIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroFeeVault.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(0),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenLiquidityAdapterIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroLiquidityAdapter.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(0),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenLiquidityRecipientIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroLiquidityRecipient.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            address(0),
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenVirtualUsdcReserveIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroVirtualUsdcReserve.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            0,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenVirtualTokenReserveIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroVirtualTokenReserve.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            0,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenBuyFeeEqualsTenThousand() public {
        vm.expectRevert(LaunchFactory.InvalidBuyFeeBps.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            10_000,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenBuyFeeExceedsTenThousand() public {
        vm.expectRevert(LaunchFactory.InvalidBuyFeeBps.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            10_001,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenSellFeeEqualsTenThousand() public {
        vm.expectRevert(LaunchFactory.InvalidSellFeeBps.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            10_000,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenSellFeeExceedsTenThousand() public {
        vm.expectRevert(LaunchFactory.InvalidSellFeeBps.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            10_001,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenGraduationThresholdIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroGraduationThreshold.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            0,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function test_RevertWhenMaxMetadataUriLengthIsZero() public {
        vm.expectRevert(LaunchFactory.ZeroMaxMetadataUriLength.selector);
        _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            0
        );
    }

    function test_CreateLaunchSucceedsForNormalCreator() public {
        string memory name_ = "LibrARC";
        string memory symbol_ = "LARC";
        string memory metadataUri_ = "ipfs://librarc/launch/1";
        bytes32 metadataHash = keccak256(bytes(metadataUri_));

        vm.recordLogs();
        vm.prank(CREATOR);
        (address launchToken, address launchPool, uint256 launchId) = factory.createLaunch(name_, symbol_, metadataUri_);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(launchId, 1);
        assertEq(factory.launchCount(), 1);

        LibrARCToken token = LibrARCToken(launchToken);
        LaunchPool pool = LaunchPool(payable(launchPool));
        BondingCurveMath.CurveState memory state = pool.curveState();

        assertEq(token.name(), name_);
        assertEq(token.symbol(), symbol_);
        assertEq(token.totalSupply(), token.FIXED_SUPPLY());
        assertEq(token.balanceOf(address(factory)), 0);
        assertEq(token.balanceOf(launchPool), token.FIXED_SUPPLY());
        assertEq(token.balanceOf(CREATOR), 0);
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
        assertEq(pool.factory(), address(factory));
        assertEq(address(pool.launchToken()), launchToken);
        assertEq(address(pool.quoteAsset()), address(quoteAsset));
        assertEq(pool.feeVault(), address(feeVault));
        assertEq(address(pool.liquidityAdapter()), address(liquidityAdapter));
        assertEq(pool.liquidityRecipient(), LIQUIDITY_RECIPIENT);
        assertEq(state.realTokenReserve, token.FIXED_SUPPLY());
        assertEq(state.realUsdcReserve, 0);
        assertEq(state.accruedProtocolFees, 0);

        (address creatorRecord, address tokenRecord, address poolRecord, bytes32 metadataHashRecord) =
            factory.launchById(launchId);
        assertEq(creatorRecord, CREATOR);
        assertEq(tokenRecord, launchToken);
        assertEq(poolRecord, launchPool);
        assertEq(metadataHashRecord, metadataHash);
        assertEq(factory.poolByToken(launchToken), launchPool);
        assertEq(factory.tokenByPool(launchPool), launchToken);
        assertTrue(factory.isLibrarcToken(launchToken));
        assertTrue(factory.isLibrarcPool(launchPool));
        assertFalse(factory.hasRole(factory.PAUSER_ROLE(), CREATOR));
        assertFalse(factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), CREATOR));

        _assertLaunchCreatedLog(
            logs, launchId, CREATOR, launchToken, launchPool, name_, symbol_, metadataUri_, metadataHash
        );
    }

    function test_LaunchIdsIncrementMonotonically() public {
        vm.startPrank(CREATOR);
        (, address firstPool, uint256 firstId) = factory.createLaunch("Token One", "ONE", "ipfs://launch/one");
        (address secondToken, address secondPool, uint256 secondId) =
            factory.createLaunch("Token Two", "TWO", "ipfs://launch/two");
        vm.stopPrank();

        assertEq(firstId, 1);
        assertEq(secondId, 2);
        assertEq(factory.launchCount(), 2);
        assertEq(factory.tokenByPool(secondPool), secondToken);
        assertEq(uint256(LaunchPool(payable(firstPool)).status()), uint256(LaunchPool.PoolStatus.Active));
    }

    function test_DuplicateNamesSymbolsAndMetadataAreAllowed() public {
        string memory name_ = "Duplicate";
        string memory symbol_ = "DUP";
        string memory metadataUri_ = "ipfs://duplicate";

        vm.startPrank(CREATOR);
        (address firstToken, address firstPool, uint256 firstId) = factory.createLaunch(name_, symbol_, metadataUri_);
        (address secondToken, address secondPool, uint256 secondId) = factory.createLaunch(name_, symbol_, metadataUri_);
        vm.stopPrank();

        assertEq(firstId, 1);
        assertEq(secondId, 2);
        assertTrue(firstToken != secondToken);
        assertTrue(firstPool != secondPool);

        (,,, bytes32 firstHash) = factory.launchById(firstId);
        (,,, bytes32 secondHash) = factory.launchById(secondId);
        assertEq(firstHash, secondHash);
    }

    function test_EmptyTokenNameRevertsAtomically() public {
        vm.prank(CREATOR);
        vm.expectRevert(LibrARCToken.LibrARCTokenEmptyName.selector);
        factory.createLaunch("", "TOK", "ipfs://meta");

        assertEq(factory.launchCount(), 0);
        (address creatorRecord, address tokenRecord, address poolRecord, bytes32 metadataHashRecord) =
            factory.launchById(1);
        assertEq(creatorRecord, address(0));
        assertEq(tokenRecord, address(0));
        assertEq(poolRecord, address(0));
        assertEq(metadataHashRecord, bytes32(0));
    }

    function test_EmptyTokenSymbolRevertsAtomically() public {
        vm.prank(CREATOR);
        vm.expectRevert(LibrARCToken.LibrARCTokenEmptySymbol.selector);
        factory.createLaunch("Token", "", "ipfs://meta");

        assertEq(factory.launchCount(), 0);
    }

    function test_EmptyMetadataUriReverts() public {
        vm.prank(CREATOR);
        vm.expectRevert(LaunchFactory.EmptyMetadataUri.selector);
        factory.createLaunch("Token", "TOK", "");

        assertEq(factory.launchCount(), 0);
    }

    function test_OversizedMetadataUriReverts() public {
        string memory metadataUri_ = _repeatChar("m", DEFAULT_MAX_METADATA_URI_LENGTH + 1);

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchFactory.MetadataUriTooLong.selector,
                uint256(bytes(metadataUri_).length),
                DEFAULT_MAX_METADATA_URI_LENGTH
            )
        );
        factory.createLaunch("Token", "TOK", metadataUri_);

        assertEq(factory.launchCount(), 0);
    }

    function test_PauserCanPauseAndUnpause() public {
        vm.prank(INITIAL_ADMIN);
        factory.pauseLaunchCreation();
        assertTrue(factory.paused());

        vm.prank(INITIAL_ADMIN);
        factory.unpauseLaunchCreation();
        assertFalse(factory.paused());
    }

    function test_UnauthorizedCallerCannotPause() public {
        bytes32 pauserRole = factory.PAUSER_ROLE();

        vm.prank(OTHER_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, pauserRole)
        );
        factory.pauseLaunchCreation();
    }

    function test_UnauthorizedCallerCannotUnpause() public {
        bytes32 pauserRole = factory.PAUSER_ROLE();

        vm.prank(INITIAL_ADMIN);
        factory.pauseLaunchCreation();

        vm.prank(OTHER_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, pauserRole)
        );
        factory.unpauseLaunchCreation();
    }

    function test_CreateLaunchWhilePausedReverts() public {
        vm.prank(INITIAL_ADMIN);
        factory.pauseLaunchCreation();

        vm.prank(CREATOR);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        factory.createLaunch("Token", "TOK", "ipfs://meta");
    }

    function test_ExistingPoolsRemainActiveWhenFactoryIsPaused() public {
        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");

        vm.prank(INITIAL_ADMIN);
        factory.pauseLaunchCreation();

        assertTrue(LaunchPool(payable(launchPool)).isTradingActive());
        assertEq(uint256(LaunchPool(payable(launchPool)).status()), uint256(LaunchPool.PoolStatus.Active));
    }

    function test_PauserCanPauseAndUnpausePoolBuys() public {
        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");
        LaunchPool pool = LaunchPool(payable(launchPool));

        vm.expectEmit(true, false, false, true, address(pool));
        emit BuysPauseUpdated(true, address(factory));
        vm.expectEmit(true, true, false, true, address(factory));
        emit PoolBuysPauseUpdated(launchPool, true, INITIAL_ADMIN);

        vm.prank(INITIAL_ADMIN);
        factory.pausePoolBuys(launchPool);

        assertTrue(pool.buysPaused());
        assertFalse(pool.allTradingPaused());
        assertFalse(pool.canBuy());
        assertTrue(pool.canSell());

        vm.prank(INITIAL_ADMIN);
        factory.unpausePoolBuys(launchPool);

        assertFalse(pool.buysPaused());
        assertTrue(pool.canBuy());
        assertTrue(pool.canSell());
    }

    function test_PauserCanPauseAndUnpauseAllPoolTrading() public {
        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");
        LaunchPool pool = LaunchPool(payable(launchPool));

        vm.expectEmit(true, false, false, true, address(pool));
        emit AllTradingPauseUpdated(true, address(factory));
        vm.expectEmit(true, true, false, true, address(factory));
        emit PoolTradingPauseUpdated(launchPool, true, INITIAL_ADMIN);

        vm.prank(INITIAL_ADMIN);
        factory.pausePoolTrading(launchPool);

        assertFalse(pool.buysPaused());
        assertTrue(pool.allTradingPaused());
        assertFalse(pool.canBuy());
        assertFalse(pool.canSell());

        vm.prank(INITIAL_ADMIN);
        factory.unpausePoolTrading(launchPool);

        assertFalse(pool.allTradingPaused());
        assertTrue(pool.canBuy());
        assertTrue(pool.canSell());
    }

    function test_UnauthorizedCallerCannotManagePoolPauses() public {
        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");
        bytes32 pauserRole = factory.PAUSER_ROLE();

        vm.startPrank(OTHER_ACCOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, pauserRole)
        );
        factory.pausePoolBuys(launchPool);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, pauserRole)
        );
        factory.unpausePoolBuys(launchPool);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, pauserRole)
        );
        factory.pausePoolTrading(launchPool);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, pauserRole)
        );
        factory.unpausePoolTrading(launchPool);

        vm.stopPrank();
    }

    function test_UnknownAndZeroPoolAddressesRevertForPauseManagement() public {
        vm.prank(INITIAL_ADMIN);
        vm.expectRevert(abi.encodeWithSelector(LaunchFactory.UnknownLibrarcPool.selector, address(0)));
        factory.pausePoolBuys(address(0));

        vm.prank(INITIAL_ADMIN);
        vm.expectRevert(abi.encodeWithSelector(LaunchFactory.UnknownLibrarcPool.selector, OTHER_ACCOUNT));
        factory.pausePoolTrading(OTHER_ACCOUNT);
    }

    function test_PausingFactoryLaunchCreationDoesNotPreventPausingAnExistingPool() public {
        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");
        LaunchPool pool = LaunchPool(payable(launchPool));

        vm.prank(INITIAL_ADMIN);
        factory.pauseLaunchCreation();

        vm.prank(INITIAL_ADMIN);
        factory.pausePoolTrading(launchPool);

        assertTrue(factory.paused());
        assertTrue(pool.allTradingPaused());
    }

    function test_PoolPauseDoesNotPauseFactoryLaunchCreation() public {
        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");

        vm.prank(INITIAL_ADMIN);
        factory.pausePoolBuys(launchPool);

        assertFalse(factory.paused());

        vm.prank(CREATOR);
        (, address secondPool, uint256 secondLaunchId) = factory.createLaunch("Token Two", "TWO", "ipfs://launch/two");

        assertEq(secondLaunchId, 2);
        assertTrue(factory.isLibrarcPool(secondPool));
    }

    function test_PausingOnePoolDoesNotAffectAnotherPoolOrAccounting() public {
        vm.startPrank(CREATOR);
        (, address firstPoolAddress,) = factory.createLaunch("Token One", "ONE", "ipfs://launch/one");
        (, address secondPoolAddress,) = factory.createLaunch("Token Two", "TWO", "ipfs://launch/two");
        vm.stopPrank();

        LaunchPool firstPool = LaunchPool(payable(firstPoolAddress));
        LaunchPool secondPool = LaunchPool(payable(secondPoolAddress));
        BondingCurveMath.CurveState memory firstStateBefore = firstPool.curveState();
        BondingCurveMath.CurveState memory secondStateBefore = secondPool.curveState();
        uint256 firstPoolTokenBalanceBefore = firstPool.launchToken().balanceOf(firstPoolAddress);
        uint256 firstPoolQuoteBalanceBefore = firstPool.quoteAsset().balanceOf(firstPoolAddress);
        uint256 secondPoolTokenBalanceBefore = secondPool.launchToken().balanceOf(secondPoolAddress);
        uint256 secondPoolQuoteBalanceBefore = secondPool.quoteAsset().balanceOf(secondPoolAddress);

        vm.prank(INITIAL_ADMIN);
        factory.pausePoolBuys(firstPoolAddress);

        assertTrue(firstPool.buysPaused());
        assertFalse(firstPool.allTradingPaused());
        assertFalse(secondPool.buysPaused());
        assertFalse(secondPool.allTradingPaused());
        _assertCurveStateEq(firstPool.curveState(), firstStateBefore);
        _assertCurveStateEq(secondPool.curveState(), secondStateBefore);
        assertEq(firstPool.launchToken().balanceOf(firstPoolAddress), firstPoolTokenBalanceBefore);
        assertEq(firstPool.quoteAsset().balanceOf(firstPoolAddress), firstPoolQuoteBalanceBefore);
        assertEq(secondPool.launchToken().balanceOf(secondPoolAddress), secondPoolTokenBalanceBefore);
        assertEq(secondPool.quoteAsset().balanceOf(secondPoolAddress), secondPoolQuoteBalanceBefore);

        vm.prank(INITIAL_ADMIN);
        factory.pausePoolTrading(secondPoolAddress);

        assertTrue(firstPool.buysPaused());
        assertFalse(firstPool.allTradingPaused());
        assertFalse(secondPool.buysPaused());
        assertTrue(secondPool.allTradingPaused());
        _assertCurveStateEq(firstPool.curveState(), firstStateBefore);
        _assertCurveStateEq(secondPool.curveState(), secondStateBefore);
    }

    function test_RevertedPoolPauseOperationEmitsNoSuccessfulEvent() public {
        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");

        vm.prank(INITIAL_ADMIN);
        factory.pausePoolBuys(launchPool);

        vm.recordLogs();
        vm.prank(INITIAL_ADMIN);
        (bool success, bytes memory revertData) =
            address(factory).call(abi.encodeCall(LaunchFactory.pausePoolBuys, (launchPool)));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertFalse(success);
        assertEq(_revertSelector(revertData), LaunchPool.PauseStateUnchanged.selector);
        assertEq(logs.length, 0);
    }

    function test_CreateLaunchAndBuySucceedsForCreatorRecipient() public {
        string memory name_ = "LibrARC";
        string memory symbol_ = "LARC";
        string memory metadataUri_ = "ipfs://librarc/launch/with-buy";
        uint256 usdcAmountIn = 100_000;
        uint256 factoryBalanceBefore = quoteAsset.balanceOf(address(factory));
        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(factory, usdcAmountIn);
        bytes32 metadataHash = keccak256(bytes(metadataUri_));

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), usdcAmountIn);

        vm.recordLogs();
        vm.prank(CREATOR);
        (address launchToken, address launchPool, uint256 launchId, uint256 tokenAmountOut) = factory.createLaunchAndBuy(
            name_, symbol_, metadataUri_, usdcAmountIn, expectedQuote.tokenAmountOut, block.timestamp, CREATOR
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();

        LaunchPool pool = LaunchPool(payable(launchPool));
        LibrARCToken token = LibrARCToken(launchToken);

        assertEq(launchId, 1);
        assertEq(factory.launchCount(), 1);
        assertEq(tokenAmountOut, expectedQuote.tokenAmountOut);
        assertEq(quoteAsset.balanceOf(CREATOR), 0);
        assertEq(quoteAsset.balanceOf(address(factory)), factoryBalanceBefore);
        assertEq(quoteAsset.allowance(address(factory), launchPool), 0);
        assertEq(quoteAsset.balanceOf(launchPool), usdcAmountIn);
        assertEq(token.balanceOf(CREATOR), tokenAmountOut);
        assertEq(token.balanceOf(launchPool), token.FIXED_SUPPLY() - tokenAmountOut);
        _assertCurveStateEq(pool.curveState(), expectedQuote.nextState);

        _assertLaunchCreatedLog(
            logs, launchId, CREATOR, launchToken, launchPool, name_, symbol_, metadataUri_, metadataHash
        );
        _assertPoolBuyExecutedLog(logs, launchPool, CREATOR, CREATOR, usdcAmountIn, expectedQuote);
        _assertCreatorInitialPurchaseExecutedLog(
            logs, launchId, CREATOR, CREATOR, launchPool, usdcAmountIn, tokenAmountOut
        );
    }

    function test_CreateLaunchAndBuySupportsAlternateRecipient() public {
        uint256 usdcAmountIn = 75_000;
        address recipient = OTHER_ACCOUNT;
        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(factory, usdcAmountIn);

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), usdcAmountIn);

        vm.prank(CREATOR);
        (address launchToken,, uint256 launchId, uint256 tokenAmountOut) = factory.createLaunchAndBuy(
            "Alt Recipient",
            "ALTR",
            "ipfs://launch/alt-recipient",
            usdcAmountIn,
            expectedQuote.tokenAmountOut,
            block.timestamp,
            recipient
        );

        assertEq(launchId, 1);
        assertEq(tokenAmountOut, expectedQuote.tokenAmountOut);
        assertEq(LibrARCToken(launchToken).balanceOf(CREATOR), 0);
        assertEq(LibrARCToken(launchToken).balanceOf(recipient), tokenAmountOut);
    }

    function test_CreateLaunchAndBuyUsesSamePricingAsEquivalentPublicBuy() public {
        uint256 usdcAmountIn = 120_000;
        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(factory, usdcAmountIn);

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), usdcAmountIn);

        vm.prank(CREATOR);
        (, address launchPool,, uint256 tokenAmountOut) = factory.createLaunchAndBuy(
            "Price Compare",
            "PRC",
            "ipfs://launch/price-compare",
            usdcAmountIn,
            expectedQuote.tokenAmountOut,
            block.timestamp,
            CREATOR
        );

        (uint256 publicTokenAmountOut, BondingCurveMath.CurveState memory publicState) =
            _executeEquivalentPublicBuy(usdcAmountIn, CREATOR, CREATOR);

        assertEq(tokenAmountOut, expectedQuote.tokenAmountOut);
        assertEq(publicTokenAmountOut, tokenAmountOut);
        _assertCurveStateEq(LaunchPool(payable(launchPool)).curveState(), publicState);
    }

    function test_CreateLaunchAndBuyZeroInitialPurchaseReverts() public {
        vm.prank(CREATOR);
        vm.expectRevert(LaunchFactory.ZeroInitialPurchase.selector);
        factory.createLaunchAndBuy("Token", "TOK", "ipfs://meta", 0, 0, block.timestamp, CREATOR);

        assertEq(factory.launchCount(), 0);
        assertEq(quoteAsset.balanceOf(address(factory)), 0);
    }

    function test_CreateLaunchAndBuyZeroRecipientReverts() public {
        vm.prank(CREATOR);
        vm.expectRevert(LaunchFactory.ZeroRecipient.selector);
        factory.createLaunchAndBuy("Token", "TOK", "ipfs://meta", 1, 0, block.timestamp, address(0));

        assertEq(factory.launchCount(), 0);
    }

    function test_CreateLaunchAndBuyExpiredDeadlineReverts() public {
        vm.warp(100);
        vm.prank(CREATOR);
        vm.expectRevert(abi.encodeWithSelector(LaunchFactory.ExpiredDeadline.selector, uint256(100), uint256(99)));
        factory.createLaunchAndBuy("Token", "TOK", "ipfs://meta", 1, 0, 99, CREATOR);

        assertEq(factory.launchCount(), 0);
    }

    function test_CreateLaunchAndBuyMissingCreatorAllowanceReverts() public {
        uint256 usdcAmountIn = 10_000;
        quoteAsset.mint(CREATOR, usdcAmountIn);

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(factory), 0, usdcAmountIn)
        );
        factory.createLaunchAndBuy("Token", "TOK", "ipfs://meta", usdcAmountIn, 1, block.timestamp, CREATOR);

        assertEq(factory.launchCount(), 0);
        assertEq(quoteAsset.balanceOf(CREATOR), usdcAmountIn);
        assertEq(quoteAsset.balanceOf(address(factory)), 0);
    }

    function test_CreateLaunchAndBuyInsufficientCreatorBalanceReverts() public {
        uint256 usdcAmountIn = 10_000;

        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), usdcAmountIn);

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, CREATOR, uint256(0), usdcAmountIn)
        );
        factory.createLaunchAndBuy("Token", "TOK", "ipfs://meta", usdcAmountIn, 1, block.timestamp, CREATOR);

        assertEq(factory.launchCount(), 0);
        assertEq(quoteAsset.balanceOf(address(factory)), 0);
    }

    function test_CreateLaunchAndBuySlippageFailureRevertsAtomically() public {
        uint256 usdcAmountIn = 100_000;
        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(factory, usdcAmountIn);

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), usdcAmountIn);

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchPool.InsufficientTokenOutput.selector,
                expectedQuote.tokenAmountOut + 1,
                expectedQuote.tokenAmountOut
            )
        );
        factory.createLaunchAndBuy(
            "Token", "TOK", "ipfs://slippage", usdcAmountIn, expectedQuote.tokenAmountOut + 1, block.timestamp, CREATOR
        );

        assertEq(factory.launchCount(), 0);
        assertEq(quoteAsset.balanceOf(CREATOR), usdcAmountIn);
        assertEq(quoteAsset.balanceOf(address(factory)), 0);
        _assertEmptyLaunchRecord(factory, 1);
    }

    function test_CreateLaunchAndBuyThresholdOvershootRevertsAtomically() public {
        LaunchFactory thresholdFactory = _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            0,
            DEFAULT_SELL_FEE_BPS,
            999,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
        uint256 usdcAmountIn = 1000;

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(thresholdFactory), usdcAmountIn);

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.GraduationThresholdExceeded.selector, uint256(0), usdcAmountIn, 999)
        );
        thresholdFactory.createLaunchAndBuy(
            "Threshold", "THR", "ipfs://threshold/overshoot", usdcAmountIn, 1, block.timestamp, CREATOR
        );

        assertEq(thresholdFactory.launchCount(), 0);
        assertEq(quoteAsset.balanceOf(CREATOR), usdcAmountIn);
        assertEq(quoteAsset.balanceOf(address(thresholdFactory)), 0);
        _assertEmptyLaunchRecord(thresholdFactory, 1);
    }

    function test_CreateLaunchAndBuyThresholdEqualitySucceedsAndEntersGraduationPending() public {
        LaunchFactory thresholdFactory = _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            0,
            DEFAULT_SELL_FEE_BPS,
            1000,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
        uint256 usdcAmountIn = 1000;
        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(thresholdFactory, usdcAmountIn);

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(thresholdFactory), usdcAmountIn);

        vm.recordLogs();
        vm.prank(CREATOR);
        (, address launchPool, uint256 launchId, uint256 tokenAmountOut) = thresholdFactory.createLaunchAndBuy(
            "Threshold",
            "THR",
            "ipfs://threshold/equality",
            usdcAmountIn,
            expectedQuote.tokenAmountOut,
            block.timestamp,
            CREATOR
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(launchId, 1);
        assertEq(tokenAmountOut, expectedQuote.tokenAmountOut);
        assertEq(uint256(LaunchPool(payable(launchPool)).status()), uint256(LaunchPool.PoolStatus.GraduationPending));
        _assertGraduationPendingLog(logs, launchPool, 1000);
    }

    function test_CreateLaunchAndBuyPreservesPreExistingFactoryQuoteAssetBalance() public {
        uint256 donatedFactoryBalance = 42_000;
        uint256 usdcAmountIn = 80_000;
        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(factory, usdcAmountIn);

        quoteAsset.mint(address(factory), donatedFactoryBalance);
        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), usdcAmountIn);

        vm.prank(CREATOR);
        (, address launchPool,, uint256 tokenAmountOut) = factory.createLaunchAndBuy(
            "Donated Balance",
            "DNT",
            "ipfs://launch/donated-balance",
            usdcAmountIn,
            expectedQuote.tokenAmountOut,
            block.timestamp,
            CREATOR
        );

        assertEq(tokenAmountOut, expectedQuote.tokenAmountOut);
        assertEq(quoteAsset.balanceOf(address(factory)), donatedFactoryBalance);
        assertEq(quoteAsset.balanceOf(launchPool), usdcAmountIn);
        assertEq(quoteAsset.allowance(address(factory), launchPool), 0);
    }

    function test_CreateLaunchAndBuyFeeOnTransferQuoteAssetRevertsOnUnexpectedBalanceDelta() public {
        FeeOnTransferQuoteAsset feeOnTransferQuoteAsset = new FeeOnTransferQuoteAsset();
        LaunchFactory feeOnTransferFactory = _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(feeOnTransferQuoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
        uint256 usdcAmountIn = 100_000;

        feeOnTransferQuoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        feeOnTransferQuoteAsset.approve(address(feeOnTransferFactory), usdcAmountIn);

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                LaunchFactory.UnexpectedQuoteAssetBalanceIncrease.selector, uint256(0), uint256(99_000), usdcAmountIn
            )
        );
        feeOnTransferFactory.createLaunchAndBuy(
            "Fee Token", "FEE", "ipfs://launch/fee-on-transfer", usdcAmountIn, 1, block.timestamp, CREATOR
        );

        assertEq(feeOnTransferFactory.launchCount(), 0);
        assertEq(feeOnTransferQuoteAsset.balanceOf(CREATOR), usdcAmountIn);
        assertEq(feeOnTransferQuoteAsset.balanceOf(address(feeOnTransferFactory)), 0);
    }

    function test_DirectNativeTransferReverts() public {
        vm.deal(address(this), 1 ether);

        vm.expectRevert(LaunchFactory.NativeAssetNotAccepted.selector);
        payable(address(factory)).transfer(1);

        assertEq(address(factory).balance, 0);
    }

    function test_UnknownCalldataReverts() public {
        (bool success, bytes memory revertData) = address(factory).call(hex"12345678");

        assertFalse(success);
        assertEq(_revertSelector(revertData), LaunchFactory.NativeAssetNotAccepted.selector);
        assertEq(address(factory).balance, 0);
    }

    function testFuzz_ValidNamesSymbolsAndMetadataCreateLaunch(
        bytes32 nameSeed,
        bytes32 symbolSeed,
        bytes32 metadataSeed,
        uint256 nameLength,
        uint256 symbolLength,
        uint256 metadataLength
    ) public {
        nameLength = bound(nameLength, 1, 32);
        symbolLength = bound(symbolLength, 1, 10);
        metadataLength = bound(metadataLength, 1, DEFAULT_MAX_METADATA_URI_LENGTH);

        string memory name_ = _alphanumericString(nameSeed, nameLength);
        string memory symbol_ = _alphanumericString(symbolSeed, symbolLength);
        string memory metadataUri_ = _alphanumericString(metadataSeed, metadataLength);

        vm.prank(CREATOR);
        (address launchToken, address launchPool, uint256 launchId) = factory.createLaunch(name_, symbol_, metadataUri_);

        assertEq(launchId, 1);
        assertEq(factory.launchCount(), 1);
        assertEq(LibrARCToken(launchToken).name(), name_);
        assertEq(LibrARCToken(launchToken).symbol(), symbol_);
        assertEq(factory.poolByToken(launchToken), launchPool);
        assertEq(factory.tokenByPool(launchPool), launchToken);
    }

    function testFuzz_MultipleSequentialLaunchCreationsRemainConsistent(uint256 launchTotal) public {
        launchTotal = bound(launchTotal, 1, 12);

        for (uint256 i = 1; i <= launchTotal; ++i) {
            string memory name_ = string.concat("Token", Strings.toString(i));
            string memory symbol_ = string.concat("T", Strings.toString(i));
            string memory metadataUri_ = string.concat("ipfs://launch/", Strings.toString(i));

            vm.prank(CREATOR);
            (address launchToken, address launchPool, uint256 launchId) =
                factory.createLaunch(name_, symbol_, metadataUri_);

            assertEq(launchId, i);
            assertEq(factory.launchCount(), i);
            assertEq(factory.poolByToken(launchToken), launchPool);
            assertEq(factory.tokenByPool(launchPool), launchToken);
            assertTrue(factory.isLibrarcToken(launchToken));
            assertTrue(factory.isLibrarcPool(launchPool));
            assertEq(LibrARCToken(launchToken).balanceOf(address(factory)), 0);
            assertEq(
                LaunchPool(payable(launchPool)).curveState().realTokenReserve, LibrARCToken(launchToken).FIXED_SUPPLY()
            );
        }
    }

    function testFuzz_CreateLaunchAndBuyMatchesQuoteAndClearsAllowance(
        uint256 usdcAmountIn,
        address recipient,
        bytes32 metadataSeed
    ) public {
        usdcAmountIn = bound(usdcAmountIn, 1, 1_000_000);
        vm.assume(recipient != address(0));

        string memory metadataUri_ = _alphanumericString(metadataSeed, 24);
        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(factory, usdcAmountIn);

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(factory), usdcAmountIn);

        vm.prank(CREATOR);
        (address launchToken, address launchPool, uint256 launchId, uint256 tokenAmountOut) = factory.createLaunchAndBuy(
            "Fuzz Token", "FZTK", metadataUri_, usdcAmountIn, expectedQuote.tokenAmountOut, block.timestamp, recipient
        );

        assertEq(launchId, 1);
        assertEq(tokenAmountOut, expectedQuote.tokenAmountOut);
        assertEq(quoteAsset.allowance(address(factory), launchPool), 0);
        assertEq(quoteAsset.balanceOf(address(factory)), 0);
        assertEq(LibrARCToken(launchToken).balanceOf(recipient), tokenAmountOut);
        _assertCurveStateEq(LaunchPool(payable(launchPool)).curveState(), expectedQuote.nextState);
    }

    function testFuzz_ThresholdCrossingCreateLaunchAndBuyRevertsAtomically(uint256 usdcAmountIn) public {
        LaunchFactory thresholdFactory = _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            0,
            DEFAULT_SELL_FEE_BPS,
            50_000,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
        usdcAmountIn = bound(usdcAmountIn, 50_001, 100_000);

        quoteAsset.mint(CREATOR, usdcAmountIn);
        vm.prank(CREATOR);
        quoteAsset.approve(address(thresholdFactory), usdcAmountIn);

        vm.prank(CREATOR);
        vm.expectRevert(
            abi.encodeWithSelector(LaunchPool.GraduationThresholdExceeded.selector, uint256(0), usdcAmountIn, 50_000)
        );
        thresholdFactory.createLaunchAndBuy(
            "Threshold Fuzz", "TFZ", "ipfs://launch/threshold-fuzz", usdcAmountIn, 1, block.timestamp, CREATOR
        );

        assertEq(thresholdFactory.launchCount(), 0);
        assertEq(quoteAsset.balanceOf(address(thresholdFactory)), 0);
        assertEq(quoteAsset.balanceOf(CREATOR), usdcAmountIn);
    }

    function testFuzz_MultipleSequentialCreateLaunchAndBuyCallsProduceMonotonicIds(
        uint256 firstUsdcAmountIn,
        uint256 secondUsdcAmountIn
    ) public {
        firstUsdcAmountIn = bound(firstUsdcAmountIn, 1, 500_000);
        secondUsdcAmountIn = bound(secondUsdcAmountIn, 1, 500_000);

        BondingCurveMath.BuyQuote memory firstQuote = _expectedInitialBuyQuote(factory, firstUsdcAmountIn);
        BondingCurveMath.BuyQuote memory secondQuote = _expectedInitialBuyQuote(factory, secondUsdcAmountIn);

        quoteAsset.mint(CREATOR, firstUsdcAmountIn + secondUsdcAmountIn);

        vm.startPrank(CREATOR);
        quoteAsset.approve(address(factory), firstUsdcAmountIn + secondUsdcAmountIn);
        (, address firstPool, uint256 firstLaunchId, uint256 firstTokenAmountOut) = factory.createLaunchAndBuy(
            "First Sequential",
            "FSQ",
            "ipfs://launch/first-sequential",
            firstUsdcAmountIn,
            firstQuote.tokenAmountOut,
            block.timestamp,
            CREATOR
        );
        (, address secondPool, uint256 secondLaunchId, uint256 secondTokenAmountOut) = factory.createLaunchAndBuy(
            "Second Sequential",
            "SSQ",
            "ipfs://launch/second-sequential",
            secondUsdcAmountIn,
            secondQuote.tokenAmountOut,
            block.timestamp,
            CREATOR
        );
        vm.stopPrank();

        assertEq(firstLaunchId, 1);
        assertEq(secondLaunchId, 2);
        assertEq(factory.launchCount(), 2);
        assertEq(firstTokenAmountOut, firstQuote.tokenAmountOut);
        assertEq(secondTokenAmountOut, secondQuote.tokenAmountOut);
        assertEq(quoteAsset.allowance(address(factory), firstPool), 0);
        assertEq(quoteAsset.allowance(address(factory), secondPool), 0);
    }

    function testFuzz_UnauthorizedCallersCannotUsePoolPauseManagement(address caller, uint8 operation) public {
        vm.assume(caller != INITIAL_ADMIN);

        vm.prank(CREATOR);
        (, address launchPool,) = factory.createLaunch("Token", "TOK", "ipfs://meta");
        LaunchPool pool = LaunchPool(payable(launchPool));
        BondingCurveMath.CurveState memory stateBefore = pool.curveState();
        uint256 tokenBalanceBefore = pool.launchToken().balanceOf(launchPool);
        uint256 quoteBalanceBefore = pool.quoteAsset().balanceOf(launchPool);
        bytes32 pauserRole = factory.PAUSER_ROLE();

        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, caller, pauserRole)
        );

        uint8 selectedOperation = operation % 4;
        if (selectedOperation == 0) {
            factory.pausePoolBuys(launchPool);
        } else if (selectedOperation == 1) {
            factory.unpausePoolBuys(launchPool);
        } else if (selectedOperation == 2) {
            factory.pausePoolTrading(launchPool);
        } else {
            factory.unpausePoolTrading(launchPool);
        }

        assertFalse(pool.buysPaused());
        assertFalse(pool.allTradingPaused());
        _assertCurveStateEq(pool.curveState(), stateBefore);
        assertEq(pool.launchToken().balanceOf(launchPool), tokenBalanceBefore);
        assertEq(pool.quoteAsset().balanceOf(launchPool), quoteBalanceBefore);
        assertEq(uint256(pool.status()), uint256(LaunchPool.PoolStatus.Active));
    }

    function testFuzz_RegisteredPoolPauseSequencesMaintainIndependentState(uint8 firstSequence, uint8 secondSequence)
        public
    {
        vm.startPrank(CREATOR);
        (, address firstPoolAddress,) = factory.createLaunch("First Pool", "FST", "ipfs://launch/first-pool");
        (, address secondPoolAddress,) = factory.createLaunch("Second Pool", "SND", "ipfs://launch/second-pool");
        vm.stopPrank();

        LaunchPool firstPool = LaunchPool(payable(firstPoolAddress));
        LaunchPool secondPool = LaunchPool(payable(secondPoolAddress));
        BondingCurveMath.CurveState memory firstStateBefore = firstPool.curveState();
        BondingCurveMath.CurveState memory secondStateBefore = secondPool.curveState();
        uint256 firstTokenBalanceBefore = firstPool.launchToken().balanceOf(firstPoolAddress);
        uint256 firstQuoteBalanceBefore = firstPool.quoteAsset().balanceOf(firstPoolAddress);
        uint256 secondTokenBalanceBefore = secondPool.launchToken().balanceOf(secondPoolAddress);
        uint256 secondQuoteBalanceBefore = secondPool.quoteAsset().balanceOf(secondPoolAddress);

        _applyPoolPauseSequence(factory, firstPoolAddress, firstSequence);
        _applyPoolPauseSequence(factory, secondPoolAddress, secondSequence);

        bool firstBuysPaused = (firstSequence & 0x01 != 0) && (firstSequence & 0x02 == 0);
        bool firstTradingPaused = (firstSequence & 0x04 != 0) && (firstSequence & 0x08 == 0);
        bool secondBuysPaused = (secondSequence & 0x01 != 0) && (secondSequence & 0x02 == 0);
        bool secondTradingPaused = (secondSequence & 0x04 != 0) && (secondSequence & 0x08 == 0);

        assertEq(firstPool.buysPaused(), firstBuysPaused);
        assertEq(firstPool.allTradingPaused(), firstTradingPaused);
        assertEq(firstPool.canBuy(), !firstBuysPaused && !firstTradingPaused);
        assertEq(firstPool.canSell(), !firstTradingPaused);
        assertEq(secondPool.buysPaused(), secondBuysPaused);
        assertEq(secondPool.allTradingPaused(), secondTradingPaused);
        assertEq(secondPool.canBuy(), !secondBuysPaused && !secondTradingPaused);
        assertEq(secondPool.canSell(), !secondTradingPaused);

        _assertCurveStateEq(firstPool.curveState(), firstStateBefore);
        _assertCurveStateEq(secondPool.curveState(), secondStateBefore);
        assertEq(firstPool.launchToken().balanceOf(firstPoolAddress), firstTokenBalanceBefore);
        assertEq(firstPool.quoteAsset().balanceOf(firstPoolAddress), firstQuoteBalanceBefore);
        assertEq(secondPool.launchToken().balanceOf(secondPoolAddress), secondTokenBalanceBefore);
        assertEq(secondPool.quoteAsset().balanceOf(secondPoolAddress), secondQuoteBalanceBefore);
        assertEq(uint256(firstPool.status()), uint256(LaunchPool.PoolStatus.Active));
        assertEq(uint256(secondPool.status()), uint256(LaunchPool.PoolStatus.Active));
    }

    function _deployDefaultFactory() internal returns (LaunchFactory) {
        return _deployFactory(
            INITIAL_ADMIN,
            ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD,
            DEFAULT_MAX_METADATA_URI_LENGTH
        );
    }

    function _deployFactory(
        address initialAdmin_,
        uint48 adminTransferDelay_,
        address quoteAsset_,
        address feeVault_,
        address liquidityAdapter_,
        address liquidityRecipient_,
        uint256 virtualUsdcReserve_,
        uint256 virtualTokenReserve_,
        uint256 buyFeeBps_,
        uint256 sellFeeBps_,
        uint256 graduationThreshold_,
        uint256 maxMetadataUriLength_
    ) internal returns (LaunchFactory deployedFactory) {
        deployedFactory = new LaunchFactory(
            initialAdmin_,
            adminTransferDelay_,
            quoteAsset_,
            feeVault_,
            liquidityAdapter_,
            liquidityRecipient_,
            virtualUsdcReserve_,
            virtualTokenReserve_,
            buyFeeBps_,
            sellFeeBps_,
            graduationThreshold_,
            maxMetadataUriLength_
        );
    }

    function _alphanumericString(bytes32 seed, uint256 length) internal pure returns (string memory) {
        bytes memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        bytes memory output = new bytes(length);
        bytes32 current = seed;

        for (uint256 i = 0; i < length; ++i) {
            if (i % 32 == 0) {
                current = keccak256(abi.encodePacked(current, i));
            }
            output[i] = alphabet[uint8(current[i % 32]) % alphabet.length];
        }

        return string(output);
    }

    function _repeatChar(string memory char_, uint256 length) internal pure returns (string memory) {
        bytes memory output = new bytes(length);
        bytes1 value = bytes(char_)[0];

        for (uint256 i = 0; i < length; ++i) {
            output[i] = value;
        }

        return string(output);
    }

    function _revertSelector(bytes memory revertData) internal pure returns (bytes4 selector) {
        if (revertData.length < 4) {
            return bytes4(0);
        }

        assembly ("memory-safe") {
            selector := mload(add(revertData, 0x20))
        }
    }

    function _applyPoolPauseSequence(LaunchFactory targetFactory, address poolAddress, uint8 sequence) internal {
        vm.startPrank(INITIAL_ADMIN);

        if (sequence & 0x01 != 0) {
            targetFactory.pausePoolBuys(poolAddress);
        }
        if (sequence & 0x02 != 0 && LaunchPool(payable(poolAddress)).buysPaused()) {
            targetFactory.unpausePoolBuys(poolAddress);
        }
        if (sequence & 0x04 != 0) {
            targetFactory.pausePoolTrading(poolAddress);
        }
        if (sequence & 0x08 != 0 && LaunchPool(payable(poolAddress)).allTradingPaused()) {
            targetFactory.unpausePoolTrading(poolAddress);
        }

        vm.stopPrank();
    }

    function _expectedInitialBuyQuote(LaunchFactory targetFactory, uint256 usdcAmountIn)
        internal
        view
        returns (BondingCurveMath.BuyQuote memory quote)
    {
        quote = BondingCurveMath.quoteBuy(
            BondingCurveMath.CurveState({
                realUsdcReserve: 0,
                realTokenReserve: FIXED_SUPPLY,
                virtualUsdcReserve: targetFactory.virtualUsdcReserve(),
                virtualTokenReserve: targetFactory.virtualTokenReserve(),
                accruedProtocolFees: 0
            }),
            usdcAmountIn,
            targetFactory.buyFeeBps()
        );
    }

    function _executeEquivalentPublicBuy(uint256 usdcAmountIn, address buyer, address recipient)
        internal
        returns (uint256 tokenAmountOut, BondingCurveMath.CurveState memory state)
    {
        LibrARCToken token = new LibrARCToken("Public Compare", "PBC", address(this));
        LaunchPool pool = new LaunchPool(
            address(this),
            address(token),
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            LIQUIDITY_RECIPIENT,
            token.FIXED_SUPPLY(),
            DEFAULT_VIRTUAL_USDC_RESERVE,
            DEFAULT_VIRTUAL_TOKEN_RESERVE,
            DEFAULT_BUY_FEE_BPS,
            DEFAULT_SELL_FEE_BPS,
            DEFAULT_GRADUATION_THRESHOLD
        );
        assertTrue(token.transfer(address(pool), token.FIXED_SUPPLY()));
        pool.initialize();

        BondingCurveMath.BuyQuote memory expectedQuote = _expectedInitialBuyQuote(factory, usdcAmountIn);
        quoteAsset.mint(buyer, usdcAmountIn);

        vm.prank(buyer);
        quoteAsset.approve(address(pool), usdcAmountIn);

        vm.prank(buyer);
        tokenAmountOut = pool.buy(usdcAmountIn, expectedQuote.tokenAmountOut, block.timestamp, recipient);
        state = pool.curveState();
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

    function _assertEmptyLaunchRecord(LaunchFactory targetFactory, uint256 launchId) internal view {
        (address creatorRecord, address tokenRecord, address poolRecord, bytes32 metadataHashRecord) =
            targetFactory.launchById(launchId);
        assertEq(creatorRecord, address(0));
        assertEq(tokenRecord, address(0));
        assertEq(poolRecord, address(0));
        assertEq(metadataHashRecord, bytes32(0));
    }

    function _assertPoolBuyExecutedLog(
        Vm.Log[] memory logs,
        address expectedLaunchPool,
        address expectedBuyer,
        address expectedRecipient,
        uint256 expectedUsdcAmountIn,
        BondingCurveMath.BuyQuote memory expectedQuote
    ) internal {
        bytes32 eventSignature = keccak256(
            "BuyExecuted(address,address,uint256,uint256,uint256,uint256,uint256,uint256)"
        );

        for (uint256 i = 0; i < logs.length; ++i) {
            if (
                logs[i].emitter == expectedLaunchPool && logs[i].topics.length == 3
                    && logs[i].topics[0] == eventSignature
            ) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), expectedBuyer);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), expectedRecipient);

                (
                    uint256 usdcAmountIn_,
                    uint256 fee_,
                    uint256 netUsdcIn_,
                    uint256 tokenAmountOut_,
                    uint256 realUsdcReserve_,
                    uint256 realTokenReserve_
                ) = abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, uint256, uint256));

                assertEq(usdcAmountIn_, expectedUsdcAmountIn);
                assertEq(fee_, expectedQuote.fee);
                assertEq(netUsdcIn_, expectedQuote.netUsdcIn);
                assertEq(tokenAmountOut_, expectedQuote.tokenAmountOut);
                assertEq(realUsdcReserve_, expectedQuote.nextState.realUsdcReserve);
                assertEq(realTokenReserve_, expectedQuote.nextState.realTokenReserve);
                return;
            }
        }

        fail("BuyExecuted event not found");
    }

    function _assertCreatorInitialPurchaseExecutedLog(
        Vm.Log[] memory logs,
        uint256 expectedLaunchId,
        address expectedCreator,
        address expectedRecipient,
        address expectedLaunchPool,
        uint256 expectedUsdcAmountIn,
        uint256 expectedTokenAmountOut
    ) internal {
        bytes32 eventSignature = keccak256(
            "CreatorInitialPurchaseExecuted(uint256,address,address,address,uint256,uint256)"
        );

        for (uint256 i = 0; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(factory) && logs[i].topics.length == 4 && logs[i].topics[0] == eventSignature
            ) {
                assertEq(uint256(logs[i].topics[1]), expectedLaunchId);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), expectedCreator);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), expectedRecipient);

                (address launchPool_, uint256 usdcAmountIn_, uint256 tokenAmountOut_) =
                    abi.decode(logs[i].data, (address, uint256, uint256));

                assertEq(launchPool_, expectedLaunchPool);
                assertEq(usdcAmountIn_, expectedUsdcAmountIn);
                assertEq(tokenAmountOut_, expectedTokenAmountOut);
                return;
            }
        }

        fail("CreatorInitialPurchaseExecuted event not found");
    }

    function _assertGraduationPendingLog(Vm.Log[] memory logs, address expectedLaunchPool, uint256 expectedThreshold)
        internal
    {
        bytes32 eventSignature = keccak256("GraduationPendingEntered(uint256,uint256)");

        for (uint256 i = 0; i < logs.length; ++i) {
            if (
                logs[i].emitter == expectedLaunchPool && logs[i].topics.length == 1
                    && logs[i].topics[0] == eventSignature
            ) {
                (uint256 realUsdcReserve_, uint256 graduationThreshold_) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(realUsdcReserve_, expectedThreshold);
                assertEq(graduationThreshold_, expectedThreshold);
                return;
            }
        }

        fail("GraduationPendingEntered event not found");
    }

    function _assertLaunchCreatedLog(
        Vm.Log[] memory logs,
        uint256 expectedLaunchId,
        address expectedCreator,
        address expectedLaunchToken,
        address expectedLaunchPool,
        string memory expectedName,
        string memory expectedSymbol,
        string memory expectedMetadataUri,
        bytes32 expectedMetadataHash
    ) internal {
        bytes32 eventSignature = keccak256(
            "LaunchCreated(uint256,address,address,address,string,string,string,bytes32)"
        );

        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics.length == 4 && logs[i].topics[0] == eventSignature) {
                assertEq(uint256(logs[i].topics[1]), expectedLaunchId);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), expectedCreator);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), expectedLaunchToken);

                (
                    address launchPool_,
                    string memory name_,
                    string memory symbol_,
                    string memory metadataUri_,
                    bytes32 metadataHash_
                ) = abi.decode(logs[i].data, (address, string, string, string, bytes32));

                assertEq(launchPool_, expectedLaunchPool);
                assertEq(name_, expectedName);
                assertEq(symbol_, expectedSymbol);
                assertEq(metadataUri_, expectedMetadataUri);
                assertEq(metadataHash_, expectedMetadataHash);
                return;
            }
        }

        fail("LaunchCreated event not found");
    }
}
