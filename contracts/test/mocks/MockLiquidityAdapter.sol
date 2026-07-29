// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ILiquidityAdapter } from "../../src/interfaces/ILiquidityAdapter.sol";

/// @title MockLiquidityAdapter
/// @notice Test-only mock adapter for future LaunchPool graduation tests.
contract MockLiquidityAdapter is ILiquidityAdapter {
    using SafeERC20 for IERC20;

    error MockLiquidityAdapterShouldRevert();
    error MockLiquidityAdapterInvalidLaunchToken();
    error MockLiquidityAdapterInvalidQuoteAsset();
    error MockLiquidityAdapterInvalidLiquidityRecipient();
    error MockLiquidityAdapterInvalidLaunchTokenAmount();
    error MockLiquidityAdapterInvalidQuoteAssetAmount();

    event MockMigrationExecuted(
        address indexed caller,
        address indexed launchToken,
        address indexed quoteAsset,
        uint256 launchTokenAmount,
        uint256 quoteAssetAmount,
        address liquidityRecipient,
        bytes32 migrationId
    );

    address public lastCaller;
    address public lastLaunchToken;
    address public lastQuoteAsset;
    uint256 public lastLaunchTokenAmount;
    uint256 public lastQuoteAssetAmount;
    address public lastLiquidityRecipient;
    uint256 public migrationCount;
    bool public shouldRevert;

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function migrateLiquidity(
        address launchToken,
        address quoteAsset,
        uint256 launchTokenAmount,
        uint256 quoteAssetAmount,
        address liquidityRecipient
    ) external returns (bytes32 migrationId) {
        if (shouldRevert) revert MockLiquidityAdapterShouldRevert();
        if (launchToken == address(0)) revert MockLiquidityAdapterInvalidLaunchToken();
        if (quoteAsset == address(0)) revert MockLiquidityAdapterInvalidQuoteAsset();
        if (liquidityRecipient == address(0)) {
            revert MockLiquidityAdapterInvalidLiquidityRecipient();
        }
        if (launchTokenAmount == 0) revert MockLiquidityAdapterInvalidLaunchTokenAmount();
        if (quoteAssetAmount == 0) revert MockLiquidityAdapterInvalidQuoteAssetAmount();

        IERC20(launchToken).safeTransferFrom(msg.sender, address(this), launchTokenAmount);
        IERC20(quoteAsset).safeTransferFrom(msg.sender, address(this), quoteAssetAmount);

        lastCaller = msg.sender;
        lastLaunchToken = launchToken;
        lastQuoteAsset = quoteAsset;
        lastLaunchTokenAmount = launchTokenAmount;
        lastQuoteAssetAmount = quoteAssetAmount;
        lastLiquidityRecipient = liquidityRecipient;
        migrationCount += 1;

        migrationId = keccak256(
            abi.encode(
                migrationCount,
                msg.sender,
                launchToken,
                quoteAsset,
                launchTokenAmount,
                quoteAssetAmount,
                liquidityRecipient
            )
        );

        emit MockMigrationExecuted(
            msg.sender,
            launchToken,
            quoteAsset,
            launchTokenAmount,
            quoteAssetAmount,
            liquidityRecipient,
            migrationId
        );
    }
}
