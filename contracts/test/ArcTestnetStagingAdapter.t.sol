// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Test } from "forge-std/Test.sol";

import { ArcTestnetStagingAdapter } from "../src/adapters/ArcTestnetStagingAdapter.sol";

contract MockArcUsdcToken is ERC20 {
    constructor() ERC20("Arc USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MintableToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeOnTransferToken is ERC20 {
    uint256 public constant FEE_BPS = 500;
    address public immutable feeSink;
    address public feeExemptSender;

    constructor(address feeSink_) ERC20("Fee On Transfer", "FEE") {
        feeSink = feeSink_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeExemptSender(address feeExemptSender_) external {
        feeExemptSender = feeExemptSender_;
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
        _update(from, to, value);

        if (from != address(0) && to != address(0) && from != feeExemptSender) {
            uint256 fee = value * FEE_BPS / 10_000;
            if (fee > 0) {
                _update(from, feeSink, fee);
            }
        }
    }
}

contract ArcTestnetStagingAdapterTest is Test {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant STAGING_RECIPIENT = address(0xF00D);
    address internal constant POOL = address(0xBEEF);
    address internal constant FEE_SINK = address(0xDEAD);

    ArcTestnetStagingAdapter internal adapter;
    MockArcUsdcToken internal quoteTemplate;
    MockArcUsdcToken internal quoteAsset;
    MintableToken internal launchToken;

    function setUp() public {
        vm.chainId(ARC_TESTNET_CHAIN_ID);

        quoteTemplate = new MockArcUsdcToken();
        vm.etch(ARC_USDC, address(quoteTemplate).code);
        quoteAsset = MockArcUsdcToken(ARC_USDC);
        launchToken = new MintableToken("Launch Token", "LCH");
        adapter = new ArcTestnetStagingAdapter(STAGING_RECIPIENT);
    }

    function test_DeploymentSucceedsOnArcTestnet() public view {
        assertEq(adapter.stagingRecipient(), STAGING_RECIPIENT);
        assertEq(adapter.ARC_USDC(), ARC_USDC);
        assertEq(adapter.ARC_TESTNET_CHAIN_ID(), ARC_TESTNET_CHAIN_ID);
        assertEq(adapter.migrationCount(), 0);
    }

    function test_DeploymentRevertsOnWrongChain() public {
        vm.chainId(1);

        vm.expectRevert(
            abi.encodeWithSelector(ArcTestnetStagingAdapter.WrongChain.selector, uint256(1))
        );
        new ArcTestnetStagingAdapter(STAGING_RECIPIENT);
    }

    function test_ZeroStagingRecipientReverts() public {
        vm.expectRevert(ArcTestnetStagingAdapter.ZeroStagingRecipient.selector);
        new ArcTestnetStagingAdapter(address(0));
    }

    function test_ImmutableRecipientIsCorrect() public view {
        assertEq(adapter.stagingRecipient(), STAGING_RECIPIENT);
    }

    function test_MigrationPullsExactLaunchTokenAmount() public {
        uint256 launchAmount = 100 ether;
        uint256 quoteAmount = 250 * 10 ** 6;

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);
        uint256 callerLaunchBefore = launchToken.balanceOf(POOL);

        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        assertEq(launchToken.balanceOf(POOL), callerLaunchBefore - launchAmount);
    }

    function test_MigrationPullsExactArcUsdcAmount() public {
        uint256 launchAmount = 100 ether;
        uint256 quoteAmount = 250 * 10 ** 6;

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);
        uint256 callerQuoteBefore = quoteAsset.balanceOf(POOL);

        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        assertEq(quoteAsset.balanceOf(POOL), callerQuoteBefore - quoteAmount);
    }

    function test_RecipientReceivesExactAmounts() public {
        uint256 launchAmount = 75 ether;
        uint256 quoteAmount = 90 * 10 ** 6;

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);

        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        assertEq(launchToken.balanceOf(STAGING_RECIPIENT), launchAmount);
        assertEq(quoteAsset.balanceOf(STAGING_RECIPIENT), quoteAmount);
    }

    function test_AdapterRetainsNoMigratedAssets() public {
        uint256 launchAmount = 40 ether;
        uint256 quoteAmount = 40 * 10 ** 6;

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);

        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        assertEq(launchToken.balanceOf(address(adapter)), 0);
        assertEq(quoteAsset.balanceOf(address(adapter)), 0);
    }

    function test_EveryMigrationRecordFieldIsCorrect() public {
        uint256 launchAmount = 55 ether;
        uint256 quoteAmount = 77 * 10 ** 6;

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);

        vm.prank(POOL);
        bytes32 migrationId = adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        (
            address caller,
            address recordedLaunchToken,
            address recordedQuoteAsset,
            uint256 recordedLaunchTokenAmount,
            uint256 recordedQuoteAssetAmount,
            address recordedRecipient,
            uint256 recordedMigrationCount
        ) = adapter.migrationRecordById(migrationId);

        assertEq(caller, POOL);
        assertEq(recordedLaunchToken, address(launchToken));
        assertEq(recordedQuoteAsset, ARC_USDC);
        assertEq(recordedLaunchTokenAmount, launchAmount);
        assertEq(recordedQuoteAssetAmount, quoteAmount);
        assertEq(recordedRecipient, STAGING_RECIPIENT);
        assertEq(recordedMigrationCount, 1);
    }

    function test_ReturnedMigrationIdIsNonZero() public {
        uint256 launchAmount = 10 ether;
        uint256 quoteAmount = 15 * 10 ** 6;

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);

        vm.prank(POOL);
        bytes32 migrationId = adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        assertTrue(migrationId != bytes32(0));
    }

    function test_ConsecutiveMigrationsReturnDifferentIds() public {
        _fundAndApprove(address(launchToken), 100 ether, 100 * 10 ** 6);

        vm.startPrank(POOL);
        bytes32 firstId = adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, 40 ether, 40 * 10 ** 6, STAGING_RECIPIENT
        );
        bytes32 secondId = adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, 60 ether, 60 * 10 ** 6, STAGING_RECIPIENT
        );
        vm.stopPrank();

        assertTrue(firstId != secondId);
    }

    function test_MigrationCountIncrements() public {
        _fundAndApprove(address(launchToken), 30 ether, 30 * 10 ** 6);

        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, 10 ether, 10 * 10 ** 6, STAGING_RECIPIENT
        );

        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, 20 ether, 20 * 10 ** 6, STAGING_RECIPIENT
        );

        assertEq(adapter.migrationCount(), 2);
    }

    function test_WrongQuoteAssetReverts() public {
        MintableToken wrongQuoteAsset = new MintableToken("Wrong Quote", "WRQ");
        wrongQuoteAsset.mint(POOL, 1);

        vm.prank(POOL);
        wrongQuoteAsset.approve(address(adapter), 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                ArcTestnetStagingAdapter.InvalidQuoteAsset.selector, address(wrongQuoteAsset)
            )
        );
        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), address(wrongQuoteAsset), 1 ether, 1, STAGING_RECIPIENT
        );
    }

    function test_ZeroLaunchTokenReverts() public {
        vm.expectRevert(ArcTestnetStagingAdapter.ZeroLaunchToken.selector);
        vm.prank(POOL);
        adapter.migrateLiquidity(address(0), ARC_USDC, 1, 1, STAGING_RECIPIENT);
    }

    function test_ZeroLaunchTokenAmountReverts() public {
        vm.expectRevert(ArcTestnetStagingAdapter.ZeroLaunchTokenAmount.selector);
        vm.prank(POOL);
        adapter.migrateLiquidity(address(launchToken), ARC_USDC, 0, 1, STAGING_RECIPIENT);
    }

    function test_ZeroQuoteAssetAmountReverts() public {
        vm.expectRevert(ArcTestnetStagingAdapter.ZeroQuoteAssetAmount.selector);
        vm.prank(POOL);
        adapter.migrateLiquidity(address(launchToken), ARC_USDC, 1, 0, STAGING_RECIPIENT);
    }

    function test_RecipientMismatchReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ArcTestnetStagingAdapter.InvalidLiquidityRecipient.selector, address(0xCAFE)
            )
        );
        vm.prank(POOL);
        adapter.migrateLiquidity(address(launchToken), ARC_USDC, 1, 1, address(0xCAFE));
    }

    function test_LaunchTokenWithoutCodeReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ArcTestnetStagingAdapter.AddressHasNoCode.selector, address(0x1234)
            )
        );
        vm.prank(POOL);
        adapter.migrateLiquidity(address(0x1234), ARC_USDC, 1, 1, STAGING_RECIPIENT);
    }

    function test_QuoteAssetWithoutCodeReverts() public {
        vm.etch(ARC_USDC, hex"");

        vm.expectRevert(
            abi.encodeWithSelector(ArcTestnetStagingAdapter.AddressHasNoCode.selector, ARC_USDC)
        );
        vm.prank(POOL);
        adapter.migrateLiquidity(address(launchToken), ARC_USDC, 1, 1, STAGING_RECIPIENT);
    }

    function test_IdenticalAssetsRevert() public {
        vm.expectRevert(
            abi.encodeWithSelector(ArcTestnetStagingAdapter.IdenticalAssets.selector, ARC_USDC)
        );
        vm.prank(POOL);
        adapter.migrateLiquidity(ARC_USDC, ARC_USDC, 1, 1, STAGING_RECIPIENT);
    }

    function test_MissingAllowanceReverts() public {
        launchToken.mint(POOL, 10 ether);
        quoteAsset.mint(POOL, 10 * 10 ** 6);

        vm.expectRevert();
        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, 10 ether, 10 * 10 ** 6, STAGING_RECIPIENT
        );
    }

    function test_InsufficientBalanceReverts() public {
        launchToken.mint(POOL, 5 ether);
        quoteAsset.mint(POOL, 5 * 10 ** 6);

        vm.prank(POOL);
        launchToken.approve(address(adapter), type(uint256).max);
        vm.prank(POOL);
        quoteAsset.approve(address(adapter), type(uint256).max);

        vm.expectRevert();
        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, 10 ether, 10 * 10 ** 6, STAGING_RECIPIENT
        );
    }

    function test_FeeOnTransferAssetCausingBalanceMismatchReverts() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken(FEE_SINK);
        feeToken.setFeeExemptSender(address(adapter));
        feeToken.mint(POOL, 200 ether);
        quoteAsset.mint(POOL, 100 * 10 ** 6);

        vm.prank(POOL);
        feeToken.approve(address(adapter), type(uint256).max);
        vm.prank(POOL);
        quoteAsset.approve(address(adapter), type(uint256).max);

        vm.expectRevert();
        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(feeToken), ARC_USDC, 100 ether, 100 * 10 ** 6, STAGING_RECIPIENT
        );
    }

    function test_FailedMigrationLeavesBalancesAndRecordsUnchanged() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken(FEE_SINK);
        feeToken.setFeeExemptSender(address(adapter));
        feeToken.mint(POOL, 200 ether);
        quoteAsset.mint(POOL, 100 * 10 ** 6);

        vm.prank(POOL);
        feeToken.approve(address(adapter), type(uint256).max);
        vm.prank(POOL);
        quoteAsset.approve(address(adapter), type(uint256).max);

        uint256 callerLaunchBefore = feeToken.balanceOf(POOL);
        uint256 callerQuoteBefore = quoteAsset.balanceOf(POOL);
        uint256 recipientLaunchBefore = feeToken.balanceOf(STAGING_RECIPIENT);
        uint256 recipientQuoteBefore = quoteAsset.balanceOf(STAGING_RECIPIENT);
        uint256 adapterLaunchBefore = feeToken.balanceOf(address(adapter));
        uint256 adapterQuoteBefore = quoteAsset.balanceOf(address(adapter));
        uint256 migrationCountBefore = adapter.migrationCount();

        vm.expectRevert();
        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(feeToken), ARC_USDC, 100 ether, 100 * 10 ** 6, STAGING_RECIPIENT
        );

        assertEq(feeToken.balanceOf(POOL), callerLaunchBefore);
        assertEq(quoteAsset.balanceOf(POOL), callerQuoteBefore);
        assertEq(feeToken.balanceOf(STAGING_RECIPIENT), recipientLaunchBefore);
        assertEq(quoteAsset.balanceOf(STAGING_RECIPIENT), recipientQuoteBefore);
        assertEq(feeToken.balanceOf(address(adapter)), adapterLaunchBefore);
        assertEq(quoteAsset.balanceOf(address(adapter)), adapterQuoteBefore);
        assertEq(adapter.migrationCount(), migrationCountBefore);
    }

    function test_DirectNativeTransferReverts() public {
        vm.deal(address(this), 1);
        vm.expectRevert(ArcTestnetStagingAdapter.NativeAssetNotAccepted.selector);
        payable(address(adapter)).transfer(1);
    }

    function test_UnknownCalldataReverts() public {
        (bool success, bytes memory returndata) =
            address(adapter).call(abi.encodeWithSignature("unknownCall()"));

        assertFalse(success);
        assertEq(
            _revertSelector(returndata), ArcTestnetStagingAdapter.NativeAssetNotAccepted.selector
        );
    }

    function test_TotalErc20SuppliesRemainUnchanged() public {
        uint256 launchAmount = 25 ether;
        uint256 quoteAmount = 12 * 10 ** 6;

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);
        uint256 launchSupplyBefore = launchToken.totalSupply();
        uint256 quoteSupplyBefore = quoteAsset.totalSupply();

        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        assertEq(launchToken.totalSupply(), launchSupplyBefore);
        assertEq(quoteAsset.totalSupply(), quoteSupplyBefore);
    }

    function testFuzz_ValidMigrationAmounts(uint256 launchAmount, uint256 quoteAmount) public {
        launchAmount = bound(launchAmount, 1, 1_000_000 ether);
        quoteAmount = bound(quoteAmount, 1, 1_000_000 * 10 ** 6);

        _fundAndApprove(address(launchToken), launchAmount, quoteAmount);

        vm.prank(POOL);
        bytes32 migrationId = adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, launchAmount, quoteAmount, STAGING_RECIPIENT
        );

        assertTrue(migrationId != bytes32(0));
        assertEq(launchToken.balanceOf(POOL), 0);
        assertEq(quoteAsset.balanceOf(POOL), 0);
        assertEq(launchToken.balanceOf(STAGING_RECIPIENT), launchAmount);
        assertEq(quoteAsset.balanceOf(STAGING_RECIPIENT), quoteAmount);
    }

    function test_ContractCannotBeUsedAfterChainIdChangesAwayFromArcTestnet() public {
        _fundAndApprove(address(launchToken), 10 ether, 10 * 10 ** 6);
        vm.chainId(1);

        vm.expectRevert(
            abi.encodeWithSelector(ArcTestnetStagingAdapter.WrongChain.selector, uint256(1))
        );
        vm.prank(POOL);
        adapter.migrateLiquidity(
            address(launchToken), ARC_USDC, 10 ether, 10 * 10 ** 6, STAGING_RECIPIENT
        );
    }

    function _fundAndApprove(address launchTokenAddress, uint256 launchAmount, uint256 quoteAmount)
        internal
    {
        MintableToken(launchTokenAddress).mint(POOL, launchAmount);
        quoteAsset.mint(POOL, quoteAmount);

        vm.prank(POOL);
        IERC20(launchTokenAddress).approve(address(adapter), type(uint256).max);
        vm.prank(POOL);
        IERC20(ARC_USDC).approve(address(adapter), type(uint256).max);
    }

    function _revertSelector(bytes memory revertData) internal pure returns (bytes4 selector) {
        if (revertData.length < 4) {
            return bytes4(0);
        }

        assembly ("memory-safe") {
            selector := mload(add(revertData, 0x20))
        }
    }
}
