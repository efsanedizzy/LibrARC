// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { ILiquidityAdapter } from "../interfaces/ILiquidityAdapter.sol";

/// @title ArcTestnetStagingAdapter
/// @notice ARC TESTNET ONLY and NOT A DEX liquidity adapter.
/// @dev This contract does not create any LP position or route liquidity to a DEX.
/// It exists only to move graduated Arc Testnet assets to one immutable staging recipient
/// while no reviewed general-purpose custom-token DEX adapter is available.
contract ArcTestnetStagingAdapter is ILiquidityAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Stored details for a completed staging migration.
    struct MigrationRecord {
        address caller;
        address launchToken;
        address quoteAsset;
        uint256 launchTokenAmount;
        uint256 quoteAssetAmount;
        address stagingRecipient;
        uint256 migrationCount;
    }

    error WrongChain(uint256 actualChainId);
    error ZeroStagingRecipient();
    error ZeroLaunchToken();
    error InvalidQuoteAsset(address quoteAsset);
    error ZeroLaunchTokenAmount();
    error ZeroQuoteAssetAmount();
    error InvalidLiquidityRecipient(address liquidityRecipient);
    error AddressHasNoCode(address account);
    error IdenticalAssets(address asset);
    error CallerBalanceMismatch(address asset, uint256 expectedBalance, uint256 actualBalance);
    error RecipientBalanceMismatch(address asset, uint256 expectedBalance, uint256 actualBalance);
    error AdapterBalanceMismatch(address asset, uint256 expectedBalance, uint256 actualBalance);
    error NativeAssetNotAccepted();

    /// @notice Arc Testnet chain ID.
    uint256 public constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    /// @notice The official Arc Testnet USDC ERC-20 contract.
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    /// @notice The immutable staging recipient for all successful migrations.
    address public immutable stagingRecipient;

    /// @notice Number of successful completed migrations.
    uint256 public migrationCount;

    /// @notice Migration record lookup by deterministic migration ID.
    mapping(bytes32 migrationId => MigrationRecord) public migrationRecordById;

    /// @notice Emitted after a successful Arc Testnet staging migration.
    event ArcTestnetStagingMigration(
        bytes32 indexed migrationId,
        address indexed caller,
        address indexed launchToken,
        address quoteAsset,
        uint256 launchTokenAmount,
        uint256 quoteAssetAmount,
        address stagingRecipient,
        uint256 migrationCount
    );

    /// @notice Creates the Arc Testnet-only staging adapter.
    /// @param stagingRecipient_ The immutable recipient that receives all migrated assets.
    constructor(address stagingRecipient_) {
        _requireArcTestnetChain();
        if (stagingRecipient_ == address(0)) revert ZeroStagingRecipient();

        stagingRecipient = stagingRecipient_;
    }

    /// @inheritdoc ILiquidityAdapter
    function migrateLiquidity(
        address launchToken,
        address quoteAsset,
        uint256 launchTokenAmount,
        uint256 quoteAssetAmount,
        address liquidityRecipient
    ) external nonReentrant returns (bytes32 migrationId) {
        _requireArcTestnetChain();
        if (launchToken == address(0)) revert ZeroLaunchToken();
        if (quoteAsset != ARC_USDC) revert InvalidQuoteAsset(quoteAsset);
        if (launchTokenAmount == 0) revert ZeroLaunchTokenAmount();
        if (quoteAssetAmount == 0) revert ZeroQuoteAssetAmount();
        if (liquidityRecipient != stagingRecipient) {
            revert InvalidLiquidityRecipient(liquidityRecipient);
        }
        if (launchToken == quoteAsset) revert IdenticalAssets(launchToken);
        if (launchToken.code.length == 0) revert AddressHasNoCode(launchToken);
        if (quoteAsset.code.length == 0) revert AddressHasNoCode(quoteAsset);

        IERC20 launchTokenContract = IERC20(launchToken);
        IERC20 quoteAssetContract = IERC20(quoteAsset);

        uint256 callerLaunchBalanceBefore = launchTokenContract.balanceOf(msg.sender);
        uint256 callerQuoteBalanceBefore = quoteAssetContract.balanceOf(msg.sender);
        uint256 recipientLaunchBalanceBefore = launchTokenContract.balanceOf(stagingRecipient);
        uint256 recipientQuoteBalanceBefore = quoteAssetContract.balanceOf(stagingRecipient);
        uint256 adapterLaunchBalanceBefore = launchTokenContract.balanceOf(address(this));
        uint256 adapterQuoteBalanceBefore = quoteAssetContract.balanceOf(address(this));

        launchTokenContract.safeTransferFrom(msg.sender, address(this), launchTokenAmount);
        quoteAssetContract.safeTransferFrom(msg.sender, address(this), quoteAssetAmount);

        launchTokenContract.safeTransfer(stagingRecipient, launchTokenAmount);
        quoteAssetContract.safeTransfer(stagingRecipient, quoteAssetAmount);

        uint256 callerLaunchBalanceAfter = launchTokenContract.balanceOf(msg.sender);
        uint256 callerQuoteBalanceAfter = quoteAssetContract.balanceOf(msg.sender);
        uint256 recipientLaunchBalanceAfter = launchTokenContract.balanceOf(stagingRecipient);
        uint256 recipientQuoteBalanceAfter = quoteAssetContract.balanceOf(stagingRecipient);
        uint256 adapterLaunchBalanceAfter = launchTokenContract.balanceOf(address(this));
        uint256 adapterQuoteBalanceAfter = quoteAssetContract.balanceOf(address(this));

        uint256 expectedCallerLaunchBalanceAfter = callerLaunchBalanceBefore - launchTokenAmount;
        uint256 expectedCallerQuoteBalanceAfter = callerQuoteBalanceBefore - quoteAssetAmount;
        uint256 expectedRecipientLaunchBalanceAfter =
            recipientLaunchBalanceBefore + launchTokenAmount;
        uint256 expectedRecipientQuoteBalanceAfter = recipientQuoteBalanceBefore + quoteAssetAmount;

        if (callerLaunchBalanceAfter != expectedCallerLaunchBalanceAfter) {
            revert CallerBalanceMismatch(
                launchToken, expectedCallerLaunchBalanceAfter, callerLaunchBalanceAfter
            );
        }
        if (callerQuoteBalanceAfter != expectedCallerQuoteBalanceAfter) {
            revert CallerBalanceMismatch(
                quoteAsset, expectedCallerQuoteBalanceAfter, callerQuoteBalanceAfter
            );
        }
        if (recipientLaunchBalanceAfter != expectedRecipientLaunchBalanceAfter) {
            revert RecipientBalanceMismatch(
                launchToken, expectedRecipientLaunchBalanceAfter, recipientLaunchBalanceAfter
            );
        }
        if (recipientQuoteBalanceAfter != expectedRecipientQuoteBalanceAfter) {
            revert RecipientBalanceMismatch(
                quoteAsset, expectedRecipientQuoteBalanceAfter, recipientQuoteBalanceAfter
            );
        }
        if (adapterLaunchBalanceAfter != adapterLaunchBalanceBefore) {
            revert AdapterBalanceMismatch(
                launchToken, adapterLaunchBalanceBefore, adapterLaunchBalanceAfter
            );
        }
        if (adapterQuoteBalanceAfter != adapterQuoteBalanceBefore) {
            revert AdapterBalanceMismatch(
                quoteAsset, adapterQuoteBalanceBefore, adapterQuoteBalanceAfter
            );
        }

        uint256 nextMigrationCount = migrationCount + 1;
        migrationId = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                msg.sender,
                launchToken,
                quoteAsset,
                launchTokenAmount,
                quoteAssetAmount,
                stagingRecipient,
                nextMigrationCount
            )
        );

        migrationCount = nextMigrationCount;
        migrationRecordById[migrationId] = MigrationRecord({
            caller: msg.sender,
            launchToken: launchToken,
            quoteAsset: quoteAsset,
            launchTokenAmount: launchTokenAmount,
            quoteAssetAmount: quoteAssetAmount,
            stagingRecipient: stagingRecipient,
            migrationCount: nextMigrationCount
        });

        emit ArcTestnetStagingMigration(
            migrationId,
            msg.sender,
            launchToken,
            quoteAsset,
            launchTokenAmount,
            quoteAssetAmount,
            stagingRecipient,
            nextMigrationCount
        );
    }

    receive() external payable {
        revert NativeAssetNotAccepted();
    }

    fallback() external payable {
        revert NativeAssetNotAccepted();
    }

    function _requireArcTestnetChain() internal view {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
    }
}
