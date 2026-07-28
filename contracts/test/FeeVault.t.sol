// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {
    IAccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/IAccessControlDefaultAdminRules.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Test} from "forge-std/Test.sol";

import {FeeVault} from "../src/FeeVault.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FalseReturnERC20 is IERC20 {
    mapping(address account => uint256) private _balances;

    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function totalSupply() external pure returns (uint256) {
        return 0;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    function allowance(address, address) external pure returns (uint256) {
        return 0;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

contract FeeVaultTest is Test, IERC20Errors {
    address internal constant INITIAL_ADMIN = address(0xA11CE);
    address internal constant INITIAL_TREASURY = address(0xBEEF);
    address internal constant UPDATED_TREASURY = address(0xCAFE);
    address internal constant OTHER_ACCOUNT = address(0xD00D);
    address internal constant PENDING_ADMIN = address(0xF00D);

    uint48 internal constant ADMIN_TRANSFER_DELAY = 3 days;

    FeeVault internal vault;
    MockERC20 internal token;
    FalseReturnERC20 internal falseReturnToken;

    function setUp() public {
        vault = new FeeVault(INITIAL_ADMIN, INITIAL_TREASURY, ADMIN_TRANSFER_DELAY);
        token = new MockERC20();
        falseReturnToken = new FalseReturnERC20();
    }

    function test_ConstructorSetsValuesAndRoles() public view {
        assertEq(vault.treasury(), INITIAL_TREASURY);
        assertEq(vault.defaultAdmin(), INITIAL_ADMIN);
        assertEq(vault.defaultAdminDelay(), ADMIN_TRANSFER_DELAY);
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), INITIAL_ADMIN));
        assertTrue(vault.hasRole(vault.TREASURY_MANAGER_ROLE(), INITIAL_ADMIN));
        assertTrue(vault.hasRole(vault.WITHDRAWER_ROLE(), INITIAL_ADMIN));
    }

    function test_RevertWhenInitialAdminIsZero() public {
        vm.expectRevert(FeeVault.FeeVaultInvalidInitialAdmin.selector);
        new FeeVault(address(0), INITIAL_TREASURY, ADMIN_TRANSFER_DELAY);
    }

    function test_RevertWhenInitialTreasuryIsZero() public {
        vm.expectRevert(FeeVault.FeeVaultInvalidInitialTreasury.selector);
        new FeeVault(INITIAL_ADMIN, address(0), ADMIN_TRANSFER_DELAY);
    }

    function test_RevertWhenAdminTransferDelayIsZero() public {
        vm.expectRevert(FeeVault.FeeVaultInvalidAdminTransferDelay.selector);
        new FeeVault(INITIAL_ADMIN, INITIAL_TREASURY, 0);
    }

    function test_AuthorizedTreasuryUpdate() public {
        vm.prank(INITIAL_ADMIN);
        vault.updateTreasury(UPDATED_TREASURY);

        assertEq(vault.treasury(), UPDATED_TREASURY);
    }

    function test_UnauthorizedTreasuryUpdateReverts() public {
        bytes32 treasuryManagerRole = vault.TREASURY_MANAGER_ROLE();

        vm.prank(OTHER_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, treasuryManagerRole
            )
        );
        vault.updateTreasury(UPDATED_TREASURY);
    }

    function test_TreasuryUpdateRejectsZeroAddress() public {
        vm.prank(INITIAL_ADMIN);
        vm.expectRevert(FeeVault.FeeVaultInvalidTreasury.selector);
        vault.updateTreasury(address(0));
    }

    function test_AuthorizedWithdrawalTransfersOnlyToTreasury() public {
        token.mint(address(vault), 100);

        vm.prank(INITIAL_ADMIN);
        vault.withdrawToken(token, 40);

        assertEq(token.balanceOf(INITIAL_TREASURY), 40);
        assertEq(token.balanceOf(INITIAL_ADMIN), 0);
        assertEq(token.balanceOf(address(vault)), 60);
    }

    function test_UnauthorizedWithdrawalReverts() public {
        token.mint(address(vault), 100);
        bytes32 withdrawerRole = vault.WITHDRAWER_ROLE();

        vm.prank(OTHER_ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, OTHER_ACCOUNT, withdrawerRole
            )
        );
        vault.withdrawToken(token, 40);
    }

    function test_WithdrawRejectsZeroTokenAddress() public {
        vm.prank(INITIAL_ADMIN);
        vm.expectRevert(FeeVault.FeeVaultInvalidToken.selector);
        vault.withdrawToken(IERC20(address(0)), 1);
    }

    function test_WithdrawRejectsZeroAmount() public {
        vm.prank(INITIAL_ADMIN);
        vm.expectRevert(FeeVault.FeeVaultInvalidAmount.selector);
        vault.withdrawToken(token, 0);
    }

    function test_WithdrawalGreaterThanBalanceReverts() public {
        token.mint(address(vault), 50);

        vm.prank(INITIAL_ADMIN);
        vm.expectRevert(
            abi.encodeWithSelector(ERC20InsufficientBalance.selector, address(vault), uint256(50), uint256(100))
        );
        vault.withdrawToken(token, 100);
    }

    function test_FailedSafeTransferRevertsCompletely() public {
        falseReturnToken.mint(address(vault), 25);

        vm.prank(INITIAL_ADMIN);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(falseReturnToken)));
        vault.withdrawToken(falseReturnToken, 10);
    }

    function test_TreasuryChangesAffectLaterWithdrawals() public {
        token.mint(address(vault), 100);

        vm.prank(INITIAL_ADMIN);
        vault.updateTreasury(UPDATED_TREASURY);

        vm.prank(INITIAL_ADMIN);
        vault.withdrawToken(token, 35);

        assertEq(token.balanceOf(INITIAL_TREASURY), 0);
        assertEq(token.balanceOf(UPDATED_TREASURY), 35);
    }

    function test_DirectNativeTransferReverts() public {
        vm.deal(address(this), 1 ether);

        vm.expectRevert(FeeVault.FeeVaultNativeAssetNotAccepted.selector);
        payable(address(vault)).transfer(1);
    }

    function test_DefaultAdminUsesDelayedTwoStepTransfer() public {
        bytes32 defaultAdminRole = vault.DEFAULT_ADMIN_ROLE();
        bytes32 withdrawerRole = vault.WITHDRAWER_ROLE();

        vm.prank(INITIAL_ADMIN);
        vault.beginDefaultAdminTransfer(PENDING_ADMIN);

        (address pendingAdmin, uint48 acceptSchedule) = vault.pendingDefaultAdmin();
        assertEq(pendingAdmin, PENDING_ADMIN);
        assertEq(acceptSchedule, uint48(block.timestamp + ADMIN_TRANSFER_DELAY));

        vm.prank(PENDING_ADMIN);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminDelay.selector, acceptSchedule
            )
        );
        vault.acceptDefaultAdminTransfer();

        vm.warp(uint256(acceptSchedule) + 1);

        vm.prank(PENDING_ADMIN);
        vault.acceptDefaultAdminTransfer();

        assertEq(vault.defaultAdmin(), PENDING_ADMIN);
        assertFalse(vault.hasRole(defaultAdminRole, INITIAL_ADMIN));
        assertTrue(vault.hasRole(defaultAdminRole, PENDING_ADMIN));

        vm.prank(PENDING_ADMIN);
        vault.grantRole(withdrawerRole, OTHER_ACCOUNT);

        assertTrue(vault.hasRole(withdrawerRole, OTHER_ACCOUNT));
    }

    function testFuzz_ValidWithdrawalAmounts(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000);
        token.mint(address(vault), amount);

        vm.prank(INITIAL_ADMIN);
        vault.withdrawToken(token, amount);

        assertEq(token.balanceOf(INITIAL_TREASURY), amount);
        assertEq(token.balanceOf(address(vault)), 0);
    }
}
