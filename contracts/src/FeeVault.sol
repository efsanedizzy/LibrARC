// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FeeVault
/// @notice Minimal protocol fee vault for holding ERC-20 protocol fees and forwarding withdrawals to treasury.
contract FeeVault is AccessControlDefaultAdminRules, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error FeeVaultInvalidInitialAdmin();
    error FeeVaultInvalidInitialTreasury();
    error FeeVaultInvalidAdminTransferDelay();
    error FeeVaultInvalidTreasury();
    error FeeVaultInvalidToken();
    error FeeVaultInvalidAmount();
    error FeeVaultNativeAssetNotAccepted();

    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER_ROLE");
    bytes32 public constant WITHDRAWER_ROLE = keccak256("WITHDRAWER_ROLE");

    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event TokenWithdrawn(address indexed token, address indexed treasury, uint256 amount);

    address private _treasury;

    constructor(address initialAdmin_, address initialTreasury_, uint48 adminTransferDelay_)
        AccessControlDefaultAdminRules(
            _validateAdminTransferDelay(adminTransferDelay_), _validateInitialAdmin(initialAdmin_)
        )
    {
        if (initialTreasury_ == address(0)) revert FeeVaultInvalidInitialTreasury();

        _treasury = initialTreasury_;
        _grantRole(TREASURY_MANAGER_ROLE, initialAdmin_);
        _grantRole(WITHDRAWER_ROLE, initialAdmin_);
    }

    function treasury() public view returns (address) {
        return _treasury;
    }

    function updateTreasury(address newTreasury) external onlyRole(TREASURY_MANAGER_ROLE) {
        if (newTreasury == address(0)) revert FeeVaultInvalidTreasury();

        address previousTreasury = _treasury;
        _treasury = newTreasury;

        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    function withdrawToken(IERC20 token, uint256 amount) external onlyRole(WITHDRAWER_ROLE) nonReentrant {
        if (address(token) == address(0)) revert FeeVaultInvalidToken();
        if (amount == 0) revert FeeVaultInvalidAmount();

        address currentTreasury = _treasury;
        token.safeTransfer(currentTreasury, amount);

        emit TokenWithdrawn(address(token), currentTreasury, amount);
    }

    receive() external payable {
        revert FeeVaultNativeAssetNotAccepted();
    }

    fallback() external payable {
        revert FeeVaultNativeAssetNotAccepted();
    }

    function _validateInitialAdmin(address initialAdmin_) private pure returns (address) {
        if (initialAdmin_ == address(0)) revert FeeVaultInvalidInitialAdmin();
        return initialAdmin_;
    }

    function _validateAdminTransferDelay(uint48 adminTransferDelay_) private pure returns (uint48) {
        if (adminTransferDelay_ == 0) revert FeeVaultInvalidAdminTransferDelay();
        return adminTransferDelay_;
    }
}
