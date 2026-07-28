// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ILiquidityAdapter
/// @notice Standardized migration boundary for LaunchPool graduation into external liquidity.
/// @dev Implementations are expected to be called by a LaunchPool during one-time graduation.
/// They must only pull the approved asset amounts from the caller, revert atomically on failure,
/// and return a non-zero `migrationId` after a successful production migration.
interface ILiquidityAdapter {
    /// @notice Migrates launch-token and quote-asset liquidity into an external venue or adapter-managed position.
    /// @dev Implementations must not rely on arbitrary user-selected targets or opaque calldata, and must revert
    /// atomically if the migration cannot complete successfully.
    /// @param launchToken The launch-token ERC-20 address being migrated.
    /// @param quoteAsset The quote-asset ERC-20 address paired with the launch token.
    /// @param launchTokenAmount The exact launch-token amount to pull from the caller and migrate.
    /// @param quoteAssetAmount The exact quote-asset amount to pull from the caller and migrate.
    /// @param liquidityRecipient The recipient that should receive the resulting liquidity position or claim.
    /// @return migrationId A non-zero identifier for the resulting liquidity position or completed migration.
    function migrateLiquidity(
        address launchToken,
        address quoteAsset,
        uint256 launchTokenAmount,
        uint256 quoteAssetAmount,
        address liquidityRecipient
    ) external returns (bytes32 migrationId);
}
