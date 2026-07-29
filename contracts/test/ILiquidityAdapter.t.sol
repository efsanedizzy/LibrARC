// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Test } from "forge-std/Test.sol";

import { ILiquidityAdapter } from "../src/interfaces/ILiquidityAdapter.sol";
import { MockLiquidityAdapter } from "./mocks/MockLiquidityAdapter.sol";

contract MockMigrationToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ILiquidityAdapterTest is Test, IERC20Errors {
    address internal constant LIQUIDITY_RECIPIENT = address(0xBEEF);

    uint256 internal constant INITIAL_LAUNCH_TOKEN_BALANCE = 1_000_000 ether;
    uint256 internal constant INITIAL_QUOTE_ASSET_BALANCE = 2_000_000 * 10 ** 6;

    MockMigrationToken internal launchToken;
    MockMigrationToken internal quoteAsset;
    MockLiquidityAdapter internal adapter;
    ILiquidityAdapter internal adapterInterface;

    function setUp() public {
        launchToken = new MockMigrationToken("Launch Token", "LCH");
        quoteAsset = new MockMigrationToken("Quote Asset", "USDC");
        adapter = new MockLiquidityAdapter();
        adapterInterface = ILiquidityAdapter(address(adapter));

        launchToken.mint(address(this), INITIAL_LAUNCH_TOKEN_BALANCE);
        quoteAsset.mint(address(this), INITIAL_QUOTE_ASSET_BALANCE);
    }

    function test_InterfaceCompatibleMigrationSucceeds() public {
        bytes32 migrationId = _migrate(250 ether, 750_000);

        assertTrue(migrationId != bytes32(0));
    }

    function test_AdapterPullsExactLaunchTokenAmount() public {
        uint256 launchTokenAmount = 125 ether;

        _migrate(launchTokenAmount, 500_000);

        assertEq(launchToken.balanceOf(address(adapter)), launchTokenAmount);
    }

    function test_AdapterPullsExactQuoteAssetAmount() public {
        uint256 quoteAssetAmount = 640_000;

        _migrate(125 ether, quoteAssetAmount);

        assertEq(quoteAsset.balanceOf(address(adapter)), quoteAssetAmount);
    }

    function test_CallerBalancesDecreaseByExactAmounts() public {
        uint256 launchTokenAmount = 75 ether;
        uint256 quoteAssetAmount = 330_000;

        uint256 launchTokenBalanceBefore = launchToken.balanceOf(address(this));
        uint256 quoteAssetBalanceBefore = quoteAsset.balanceOf(address(this));

        _migrate(launchTokenAmount, quoteAssetAmount);

        assertEq(launchToken.balanceOf(address(this)), launchTokenBalanceBefore - launchTokenAmount);
        assertEq(quoteAsset.balanceOf(address(this)), quoteAssetBalanceBefore - quoteAssetAmount);
    }

    function test_AdapterBalancesIncreaseByExactAmounts() public {
        uint256 launchTokenAmount = 25 ether;
        uint256 quoteAssetAmount = 120_000;

        _migrate(launchTokenAmount, quoteAssetAmount);

        assertEq(launchToken.balanceOf(address(adapter)), launchTokenAmount);
        assertEq(quoteAsset.balanceOf(address(adapter)), quoteAssetAmount);
    }

    function test_EveryRecordedParameterIsCorrect() public {
        uint256 launchTokenAmount = 300 ether;
        uint256 quoteAssetAmount = 1_250_000;

        _migrate(launchTokenAmount, quoteAssetAmount);

        assertEq(adapter.lastCaller(), address(this));
        assertEq(adapter.lastLaunchToken(), address(launchToken));
        assertEq(adapter.lastQuoteAsset(), address(quoteAsset));
        assertEq(adapter.lastLaunchTokenAmount(), launchTokenAmount);
        assertEq(adapter.lastQuoteAssetAmount(), quoteAssetAmount);
        assertEq(adapter.lastLiquidityRecipient(), LIQUIDITY_RECIPIENT);
        assertEq(adapter.migrationCount(), 1);
    }

    function test_ReturnedMigrationIdIsNonZero() public {
        bytes32 migrationId = _migrate(10 ether, 10_000);

        assertTrue(migrationId != bytes32(0));
    }

    function test_ConsecutiveMigrationsProduceDifferentIds() public {
        bytes32 firstMigrationId = _migrate(10 ether, 10_000);
        bytes32 secondMigrationId = _migrate(20 ether, 20_000);

        assertTrue(firstMigrationId != secondMigrationId);
        assertEq(adapter.migrationCount(), 2);
    }

    function test_ZeroLaunchTokenReverts() public {
        quoteAsset.approve(address(adapter), 1);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterInvalidLaunchToken.selector);
        adapterInterface.migrateLiquidity(
            address(0), address(quoteAsset), 1, 1, LIQUIDITY_RECIPIENT
        );
    }

    function test_ZeroQuoteAssetReverts() public {
        launchToken.approve(address(adapter), 1);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterInvalidQuoteAsset.selector);
        adapterInterface.migrateLiquidity(
            address(launchToken), address(0), 1, 1, LIQUIDITY_RECIPIENT
        );
    }

    function test_ZeroLaunchTokenAmountReverts() public {
        launchToken.approve(address(adapter), 1);
        quoteAsset.approve(address(adapter), 1);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterInvalidLaunchTokenAmount.selector);
        adapterInterface.migrateLiquidity(
            address(launchToken), address(quoteAsset), 0, 1, LIQUIDITY_RECIPIENT
        );
    }

    function test_ZeroQuoteAssetAmountReverts() public {
        launchToken.approve(address(adapter), 1);
        quoteAsset.approve(address(adapter), 1);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterInvalidQuoteAssetAmount.selector);
        adapterInterface.migrateLiquidity(
            address(launchToken), address(quoteAsset), 1, 0, LIQUIDITY_RECIPIENT
        );
    }

    function test_ZeroLiquidityRecipientReverts() public {
        launchToken.approve(address(adapter), 1);
        quoteAsset.approve(address(adapter), 1);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterInvalidLiquidityRecipient.selector);
        adapterInterface.migrateLiquidity(
            address(launchToken), address(quoteAsset), 1, 1, address(0)
        );
    }

    function test_MissingAllowanceReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ERC20InsufficientAllowance.selector,
                address(adapter),
                uint256(0),
                uint256(100 ether)
            )
        );
        adapterInterface.migrateLiquidity(
            address(launchToken), address(quoteAsset), 100 ether, 250_000, LIQUIDITY_RECIPIENT
        );
    }

    function test_InsufficientBalanceReverts() public {
        uint256 launchTokenAmount = launchToken.balanceOf(address(this)) + 1;
        uint256 quoteAssetAmount = 100_000;

        launchToken.approve(address(adapter), launchTokenAmount);
        quoteAsset.approve(address(adapter), quoteAssetAmount);

        vm.expectRevert(
            abi.encodeWithSelector(
                ERC20InsufficientBalance.selector,
                address(this),
                INITIAL_LAUNCH_TOKEN_BALANCE,
                launchTokenAmount
            )
        );
        adapterInterface.migrateLiquidity(
            address(launchToken),
            address(quoteAsset),
            launchTokenAmount,
            quoteAssetAmount,
            LIQUIDITY_RECIPIENT
        );
    }

    function test_ShouldRevertCausesFullTransactionToRevert() public {
        adapter.setShouldRevert(true);
        launchToken.approve(address(adapter), 100 ether);
        quoteAsset.approve(address(adapter), 250_000);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterShouldRevert.selector);
        adapterInterface.migrateLiquidity(
            address(launchToken), address(quoteAsset), 100 ether, 250_000, LIQUIDITY_RECIPIENT
        );
    }

    function test_FailedMigrationDoesNotTransferTokens() public {
        uint256 launchTokenBalanceBefore = launchToken.balanceOf(address(this));
        uint256 quoteAssetBalanceBefore = quoteAsset.balanceOf(address(this));

        adapter.setShouldRevert(true);
        launchToken.approve(address(adapter), 100 ether);
        quoteAsset.approve(address(adapter), 250_000);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterShouldRevert.selector);
        adapterInterface.migrateLiquidity(
            address(launchToken), address(quoteAsset), 100 ether, 250_000, LIQUIDITY_RECIPIENT
        );

        assertEq(launchToken.balanceOf(address(this)), launchTokenBalanceBefore);
        assertEq(quoteAsset.balanceOf(address(this)), quoteAssetBalanceBefore);
        assertEq(launchToken.balanceOf(address(adapter)), 0);
        assertEq(quoteAsset.balanceOf(address(adapter)), 0);
    }

    function test_FailedMigrationDoesNotUpdateRecordedState() public {
        adapter.setShouldRevert(true);
        launchToken.approve(address(adapter), 100 ether);
        quoteAsset.approve(address(adapter), 250_000);

        vm.expectRevert(MockLiquidityAdapter.MockLiquidityAdapterShouldRevert.selector);
        adapterInterface.migrateLiquidity(
            address(launchToken), address(quoteAsset), 100 ether, 250_000, LIQUIDITY_RECIPIENT
        );

        assertEq(adapter.lastCaller(), address(0));
        assertEq(adapter.lastLaunchToken(), address(0));
        assertEq(adapter.lastQuoteAsset(), address(0));
        assertEq(adapter.lastLaunchTokenAmount(), 0);
        assertEq(adapter.lastQuoteAssetAmount(), 0);
        assertEq(adapter.lastLiquidityRecipient(), address(0));
        assertEq(adapter.migrationCount(), 0);
    }

    function test_TotalErc20SuppliesRemainUnchanged() public {
        uint256 launchTokenSupplyBefore = launchToken.totalSupply();
        uint256 quoteAssetSupplyBefore = quoteAsset.totalSupply();

        _migrate(400 ether, 900_000);

        assertEq(launchToken.totalSupply(), launchTokenSupplyBefore);
        assertEq(quoteAsset.totalSupply(), quoteAssetSupplyBefore);
    }

    function testFuzz_ValidMigrationAmounts(uint256 launchTokenAmount, uint256 quoteAssetAmount)
        public
    {
        launchTokenAmount = bound(launchTokenAmount, 1, INITIAL_LAUNCH_TOKEN_BALANCE);
        quoteAssetAmount = bound(quoteAssetAmount, 1, INITIAL_QUOTE_ASSET_BALANCE);

        uint256 launchTokenSupplyBefore = launchToken.totalSupply();
        uint256 quoteAssetSupplyBefore = quoteAsset.totalSupply();

        bytes32 migrationId = _migrate(launchTokenAmount, quoteAssetAmount);

        assertTrue(migrationId != bytes32(0));
        assertEq(
            launchToken.balanceOf(address(this)), INITIAL_LAUNCH_TOKEN_BALANCE - launchTokenAmount
        );
        assertEq(
            quoteAsset.balanceOf(address(this)), INITIAL_QUOTE_ASSET_BALANCE - quoteAssetAmount
        );
        assertEq(launchToken.balanceOf(address(adapter)), launchTokenAmount);
        assertEq(quoteAsset.balanceOf(address(adapter)), quoteAssetAmount);
        assertEq(adapter.lastLaunchTokenAmount(), launchTokenAmount);
        assertEq(adapter.lastQuoteAssetAmount(), quoteAssetAmount);
        assertEq(launchToken.totalSupply(), launchTokenSupplyBefore);
        assertEq(quoteAsset.totalSupply(), quoteAssetSupplyBefore);
    }

    function _migrate(uint256 launchTokenAmount, uint256 quoteAssetAmount)
        internal
        returns (bytes32 migrationId)
    {
        launchToken.approve(address(adapter), launchTokenAmount);
        quoteAsset.approve(address(adapter), quoteAssetAmount);

        migrationId = adapterInterface.migrateLiquidity(
            address(launchToken),
            address(quoteAsset),
            launchTokenAmount,
            quoteAssetAmount,
            LIQUIDITY_RECIPIENT
        );
    }
}
