// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Script, console2 } from "forge-std/Script.sol";

import { FeeVault } from "../src/FeeVault.sol";
import { LaunchFactory } from "../src/LaunchFactory.sol";

/// @notice Secure Arc Testnet deployment script for FeeVault and LaunchFactory only.
/// @dev This script never reads private keys or mnemonics. Foundry signing must be supplied externally.
contract DeployArcTestnet is Script {
    error ArcTestnetOnlyChainSupported(uint256 actualChainId);
    error ArcTestnetInvalidAdmin();
    error ArcTestnetInvalidTreasury();
    error ArcTestnetInvalidLiquidityAdapter();
    error ArcTestnetInvalidLiquidityRecipient();
    error ArcTestnetInvalidAdminTransferDelay();
    error ArcTestnetInvalidVirtualUsdcReserve();
    error ArcTestnetInvalidVirtualTokenReserve();
    error ArcTestnetInvalidBuyFeeBps(uint256 actualBps);
    error ArcTestnetInvalidSellFeeBps(uint256 actualBps);
    error ArcTestnetInvalidGraduationThreshold();
    error ArcTestnetInvalidMaxMetadataUriLength();
    error ArcTestnetQuoteAssetMissingCode(address quoteAsset);
    error ArcTestnetLiquidityAdapterMissingCode(address liquidityAdapter);
    error ArcTestnetQuoteAssetInvalidDecimals(uint8 actualDecimals);
    error ArcTestnetDeploymentValidationFailed(string checkName);

    uint256 public constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    struct DeploymentConfig {
        address admin;
        address treasury;
        address liquidityAdapter;
        address liquidityRecipient;
        uint48 adminTransferDelay;
        uint256 virtualUsdcReserve;
        uint256 virtualTokenReserve;
        uint256 buyFeeBps;
        uint256 sellFeeBps;
        uint256 graduationThreshold;
        uint256 maxMetadataUriLength;
    }

    struct DeploymentResult {
        address feeVault;
        address launchFactory;
        address quoteAsset;
        address liquidityAdapter;
        address admin;
        address treasury;
        address liquidityRecipient;
    }

    function run() external returns (DeploymentResult memory result) {
        _requireArcTestnetChain();

        DeploymentConfig memory config = _loadDeploymentConfigFromEnv();
        _validateDeploymentConfig(config);
        _validateQuoteAsset(ARC_USDC);
        _validateLiquidityAdapter(config.liquidityAdapter);

        result = _deployContracts(config, ARC_USDC);
        _validateDeploymentResult(result, config, ARC_USDC);
        _printDeploymentResult(result);
    }

    function _loadDeploymentConfigFromEnv() internal view returns (DeploymentConfig memory config) {
        config.admin = vm.envOr("ARC_ADMIN", address(0));
        config.treasury = vm.envOr("ARC_TREASURY", address(0));
        config.liquidityAdapter = vm.envOr("ARC_LIQUIDITY_ADAPTER", address(0));
        config.liquidityRecipient = vm.envOr("ARC_LIQUIDITY_RECIPIENT", address(0));
        config.adminTransferDelay = uint48(vm.envOr("ARC_ADMIN_TRANSFER_DELAY", uint256(0)));
        config.virtualUsdcReserve = vm.envOr("ARC_VIRTUAL_USDC_RESERVE", uint256(0));
        config.virtualTokenReserve = vm.envOr("ARC_VIRTUAL_TOKEN_RESERVE", uint256(0));
        config.buyFeeBps = vm.envOr("ARC_BUY_FEE_BPS", uint256(0));
        config.sellFeeBps = vm.envOr("ARC_SELL_FEE_BPS", uint256(0));
        config.graduationThreshold = vm.envOr("ARC_GRADUATION_THRESHOLD", uint256(0));
        config.maxMetadataUriLength = vm.envOr("ARC_MAX_METADATA_URI_LENGTH", uint256(0));
    }

    function _requireArcTestnetChain() internal view {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert ArcTestnetOnlyChainSupported(block.chainid);
        }
    }

    function _validateDeploymentConfig(DeploymentConfig memory config) internal pure {
        if (config.admin == address(0)) revert ArcTestnetInvalidAdmin();
        if (config.treasury == address(0)) revert ArcTestnetInvalidTreasury();
        if (config.liquidityAdapter == address(0)) revert ArcTestnetInvalidLiquidityAdapter();
        if (config.liquidityRecipient == address(0)) {
            revert ArcTestnetInvalidLiquidityRecipient();
        }
        if (config.adminTransferDelay == 0) revert ArcTestnetInvalidAdminTransferDelay();
        if (config.virtualUsdcReserve == 0) revert ArcTestnetInvalidVirtualUsdcReserve();
        if (config.virtualTokenReserve == 0) revert ArcTestnetInvalidVirtualTokenReserve();
        if (config.buyFeeBps >= BPS_DENOMINATOR) {
            revert ArcTestnetInvalidBuyFeeBps(config.buyFeeBps);
        }
        if (config.sellFeeBps >= BPS_DENOMINATOR) {
            revert ArcTestnetInvalidSellFeeBps(config.sellFeeBps);
        }
        if (config.graduationThreshold == 0) revert ArcTestnetInvalidGraduationThreshold();
        if (config.maxMetadataUriLength == 0) {
            revert ArcTestnetInvalidMaxMetadataUriLength();
        }
    }

    function _validateQuoteAsset(address quoteAsset) internal view {
        if (quoteAsset.code.length == 0) revert ArcTestnetQuoteAssetMissingCode(quoteAsset);

        uint8 decimals_ = IERC20Metadata(quoteAsset).decimals();
        if (decimals_ != 6) revert ArcTestnetQuoteAssetInvalidDecimals(decimals_);
    }

    function _validateLiquidityAdapter(address liquidityAdapter) internal view {
        if (liquidityAdapter.code.length == 0) {
            revert ArcTestnetLiquidityAdapterMissingCode(liquidityAdapter);
        }
    }

    function _deployContracts(DeploymentConfig memory config, address quoteAsset)
        internal
        returns (DeploymentResult memory result)
    {
        vm.startBroadcast();

        FeeVault feeVault = new FeeVault(config.admin, config.treasury, config.adminTransferDelay);
        LaunchFactory launchFactory = new LaunchFactory(
            config.admin,
            config.adminTransferDelay,
            quoteAsset,
            address(feeVault),
            config.liquidityAdapter,
            config.liquidityRecipient,
            config.virtualUsdcReserve,
            config.virtualTokenReserve,
            config.buyFeeBps,
            config.sellFeeBps,
            config.graduationThreshold,
            config.maxMetadataUriLength
        );

        vm.stopBroadcast();

        result = DeploymentResult({
            feeVault: address(feeVault),
            launchFactory: address(launchFactory),
            quoteAsset: quoteAsset,
            liquidityAdapter: config.liquidityAdapter,
            admin: config.admin,
            treasury: config.treasury,
            liquidityRecipient: config.liquidityRecipient
        });
    }

    function _validateDeploymentResult(
        DeploymentResult memory result,
        DeploymentConfig memory config,
        address quoteAsset
    ) internal view {
        FeeVault feeVault = FeeVault(payable(result.feeVault));
        LaunchFactory launchFactory = LaunchFactory(payable(result.launchFactory));

        if (result.feeVault == address(0)) {
            revert ArcTestnetDeploymentValidationFailed("feeVault address");
        }
        if (result.launchFactory == address(0)) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory address");
        }
        if (result.quoteAsset != quoteAsset) {
            revert ArcTestnetDeploymentValidationFailed("quoteAsset address");
        }
        if (result.liquidityAdapter != config.liquidityAdapter) {
            revert ArcTestnetDeploymentValidationFailed("liquidityAdapter address");
        }
        if (result.admin != config.admin) {
            revert ArcTestnetDeploymentValidationFailed("admin address");
        }
        if (result.treasury != config.treasury) {
            revert ArcTestnetDeploymentValidationFailed("treasury address");
        }
        if (result.liquidityRecipient != config.liquidityRecipient) {
            revert ArcTestnetDeploymentValidationFailed("liquidityRecipient address");
        }

        if (feeVault.treasury() != config.treasury) {
            revert ArcTestnetDeploymentValidationFailed("feeVault treasury");
        }
        if (feeVault.defaultAdmin() != config.admin) {
            revert ArcTestnetDeploymentValidationFailed("feeVault admin");
        }
        if (!feeVault.hasRole(feeVault.DEFAULT_ADMIN_ROLE(), config.admin)) {
            revert ArcTestnetDeploymentValidationFailed("feeVault default admin role");
        }
        if (!feeVault.hasRole(feeVault.TREASURY_MANAGER_ROLE(), config.admin)) {
            revert ArcTestnetDeploymentValidationFailed("feeVault treasury manager role");
        }
        if (!feeVault.hasRole(feeVault.WITHDRAWER_ROLE(), config.admin)) {
            revert ArcTestnetDeploymentValidationFailed("feeVault withdrawer role");
        }

        if (launchFactory.defaultAdmin() != config.admin) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory admin");
        }
        if (!launchFactory.hasRole(launchFactory.DEFAULT_ADMIN_ROLE(), config.admin)) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory default admin role");
        }
        if (!launchFactory.hasRole(launchFactory.PAUSER_ROLE(), config.admin)) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory pauser role");
        }
        if (launchFactory.quoteAsset() != quoteAsset) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory quote asset");
        }
        if (launchFactory.feeVault() != result.feeVault) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory fee vault");
        }
        if (launchFactory.liquidityAdapter() != config.liquidityAdapter) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory liquidity adapter");
        }
        if (launchFactory.liquidityRecipient() != config.liquidityRecipient) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory liquidity recipient");
        }
        if (launchFactory.virtualUsdcReserve() != config.virtualUsdcReserve) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory virtual usdc reserve");
        }
        if (launchFactory.virtualTokenReserve() != config.virtualTokenReserve) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory virtual token reserve");
        }
        if (launchFactory.buyFeeBps() != config.buyFeeBps) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory buy fee");
        }
        if (launchFactory.sellFeeBps() != config.sellFeeBps) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory sell fee");
        }
        if (launchFactory.graduationThreshold() != config.graduationThreshold) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory graduation threshold");
        }
        if (launchFactory.maxMetadataUriLength() != config.maxMetadataUriLength) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory max metadata length");
        }
        if (launchFactory.launchCount() != 0) {
            revert ArcTestnetDeploymentValidationFailed("launchFactory launch count");
        }
    }

    function _printDeploymentResult(DeploymentResult memory result) internal view {
        console2.log("ARC TESTNET deployment result");
        console2.log("chainId");
        console2.logUint(block.chainid);
        console2.log("quoteAsset");
        console2.logAddress(result.quoteAsset);
        console2.log("feeVault");
        console2.logAddress(result.feeVault);
        console2.log("launchFactory");
        console2.logAddress(result.launchFactory);
        console2.log("liquidityAdapter");
        console2.logAddress(result.liquidityAdapter);
        console2.log("admin");
        console2.logAddress(result.admin);
        console2.log("treasury");
        console2.logAddress(result.treasury);
        console2.log("liquidityRecipient");
        console2.logAddress(result.liquidityRecipient);
    }
}
