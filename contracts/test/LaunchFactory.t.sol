// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
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
}

contract LaunchFactoryTest is Test {
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
