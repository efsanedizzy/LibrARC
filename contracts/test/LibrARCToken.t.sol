// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Test} from "forge-std/Test.sol";

import {LibrARCToken} from "../src/LibrARCToken.sol";

contract LibrARCTokenTest is Test, IERC20Errors {
    address internal constant INITIAL_HOLDER = address(0xA11CE);
    address internal constant ALICE = address(0xB0B);
    address internal constant BOB = address(0xCAFE);
    address internal constant SPENDER = address(0xD00D);

    uint256 internal constant TRANSFER_AMOUNT = 25_000 * 10 ** 18;

    address internal deployer = address(this);
    LibrARCToken internal token;

    function setUp() public {
        token = new LibrARCToken("LibrARC", "LARC", INITIAL_HOLDER);
    }

    function test_NameIsSet() public view {
        assertEq(token.name(), "LibrARC");
    }

    function test_SymbolIsSet() public view {
        assertEq(token.symbol(), "LARC");
    }

    function test_DecimalsReturnsEighteen() public view {
        assertEq(token.decimals(), 18);
    }

    function test_TotalSupplyMatchesFixedSupply() public view {
        assertEq(token.totalSupply(), 1_000_000_000 * 10 ** 18);
        assertEq(token.totalSupply(), token.FIXED_SUPPLY());
    }

    function test_CompleteSupplyAssignedToInitialHolder() public view {
        assertEq(token.balanceOf(INITIAL_HOLDER), token.totalSupply());
    }

    function test_DeployerReceivesNoTokensWhenNotInitialHolder() public view {
        assertEq(token.balanceOf(deployer), 0);
    }

    function test_DeployerCanReceiveFullSupplyWhenPassedAsInitialHolder() public {
        LibrARCToken deployerToken = new LibrARCToken("LibrARC", "LARC", deployer);

        assertEq(deployerToken.balanceOf(deployer), deployerToken.totalSupply());
    }

    function test_RevertWhenInitialHolderIsZeroAddress() public {
        vm.expectRevert(LibrARCToken.LibrARCTokenInvalidInitialHolder.selector);
        new LibrARCToken("LibrARC", "LARC", address(0));
    }

    function test_RevertWhenNameIsEmpty() public {
        vm.expectRevert(LibrARCToken.LibrARCTokenEmptyName.selector);
        new LibrARCToken("", "LARC", INITIAL_HOLDER);
    }

    function test_RevertWhenSymbolIsEmpty() public {
        vm.expectRevert(LibrARCToken.LibrARCTokenEmptySymbol.selector);
        new LibrARCToken("LibrARC", "", INITIAL_HOLDER);
    }

    function test_StandardTransferWorks() public {
        vm.prank(INITIAL_HOLDER);
        bool success = token.transfer(ALICE, TRANSFER_AMOUNT);

        assertTrue(success);
        assertEq(token.balanceOf(ALICE), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(INITIAL_HOLDER), token.totalSupply() - TRANSFER_AMOUNT);
    }

    function test_TransfersDoNotChangeTotalSupply() public {
        uint256 supplyBefore = token.totalSupply();

        vm.prank(INITIAL_HOLDER);
        assertTrue(token.transfer(ALICE, TRANSFER_AMOUNT));

        vm.prank(ALICE);
        assertTrue(token.transfer(BOB, TRANSFER_AMOUNT / 2));

        assertEq(token.totalSupply(), supplyBefore);
    }

    function test_ApproveAllowanceAndTransferFromWork() public {
        vm.prank(INITIAL_HOLDER);
        token.approve(SPENDER, TRANSFER_AMOUNT);

        assertEq(token.allowance(INITIAL_HOLDER, SPENDER), TRANSFER_AMOUNT);

        vm.prank(SPENDER);
        bool success = token.transferFrom(INITIAL_HOLDER, ALICE, TRANSFER_AMOUNT);

        assertTrue(success);
        assertEq(token.balanceOf(ALICE), TRANSFER_AMOUNT);
        assertEq(token.allowance(INITIAL_HOLDER, SPENDER), 0);
    }

    function test_InsufficientBalanceTransferReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ERC20InsufficientBalance.selector, deployer, uint256(0), uint256(1)));
        token.transfer(ALICE, 1);
    }

    function test_NoLibrARCMintBurnOwnerOrRoleManagementFunctionsAreCallable() public {
        _assertSelectorUnavailable(abi.encodeWithSignature("mint(address,uint256)", ALICE, 1));
        _assertSelectorUnavailable(abi.encodeWithSignature("burn(uint256)", 1));
        _assertSelectorUnavailable(abi.encodeWithSignature("owner()"));
        _assertSelectorUnavailable(abi.encodeWithSignature("grantRole(bytes32,address)", bytes32(0), ALICE));
        _assertSelectorUnavailable(abi.encodeWithSignature("hasRole(bytes32,address)", bytes32(0), ALICE));
    }

    function testFuzz_TransfersBetweenValidAddresses(uint256 firstAmount, uint256 secondAmount) public {
        firstAmount = bound(firstAmount, 0, token.totalSupply());

        vm.prank(INITIAL_HOLDER);
        assertTrue(token.transfer(ALICE, firstAmount));

        secondAmount = bound(secondAmount, 0, firstAmount);

        vm.prank(ALICE);
        assertTrue(token.transfer(BOB, secondAmount));

        assertEq(token.balanceOf(BOB), secondAmount);
        assertEq(token.balanceOf(ALICE), firstAmount - secondAmount);
        assertEq(token.balanceOf(INITIAL_HOLDER), token.totalSupply() - firstAmount);
    }

    function testFuzz_TotalSupplyRemainsConstantAfterTransfers(
        address recipientOne,
        address recipientTwo,
        uint256 amountOne,
        uint256 amountTwo
    ) public {
        vm.assume(recipientOne != address(0));
        vm.assume(recipientTwo != address(0));
        vm.assume(recipientOne != INITIAL_HOLDER);

        uint256 initialSupply = token.totalSupply();

        amountOne = bound(amountOne, 0, initialSupply);

        vm.prank(INITIAL_HOLDER);
        assertTrue(token.transfer(recipientOne, amountOne));

        amountTwo = bound(amountTwo, 0, amountOne);

        vm.prank(recipientOne);
        assertTrue(token.transfer(recipientTwo, amountTwo));

        assertEq(token.totalSupply(), initialSupply);
    }

    function _assertSelectorUnavailable(bytes memory callData) internal {
        (bool success,) = address(token).call(callData);
        assertFalse(success);
    }
}
