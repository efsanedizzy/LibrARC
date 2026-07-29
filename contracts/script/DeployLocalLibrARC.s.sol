// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Script, console2 } from "forge-std/Script.sol";

import { FeeVault } from "../src/FeeVault.sol";
import { LaunchFactory } from "../src/LaunchFactory.sol";
import { ILiquidityAdapter } from "../src/interfaces/ILiquidityAdapter.sol";

/// @notice Local-only mock Arc USDC for dry runs and smoke tests.
contract LocalMockArcUsdc is ERC20 {
    constructor() ERC20("Local Arc USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Local-only mock liquidity adapter for dry runs and smoke tests.
contract LocalMockLiquidityAdapter is ILiquidityAdapter {
    using SafeERC20 for IERC20;

    error LocalMockLiquidityAdapterInvalidLaunchToken();
    error LocalMockLiquidityAdapterInvalidQuoteAsset();
    error LocalMockLiquidityAdapterInvalidLiquidityRecipient();
    error LocalMockLiquidityAdapterInvalidLaunchTokenAmount();
    error LocalMockLiquidityAdapterInvalidQuoteAssetAmount();

    address public lastCaller;
    address public lastLaunchToken;
    address public lastQuoteAsset;
    uint256 public lastLaunchTokenAmount;
    uint256 public lastQuoteAssetAmount;
    address public lastLiquidityRecipient;
    uint256 public migrationCount;
    bytes32 public lastMigrationId;

    function migrateLiquidity(
        address launchToken,
        address quoteAsset,
        uint256 launchTokenAmount,
        uint256 quoteAssetAmount,
        address liquidityRecipient
    ) external returns (bytes32 migrationId) {
        if (launchToken == address(0)) {
            revert LocalMockLiquidityAdapterInvalidLaunchToken();
        }
        if (quoteAsset == address(0)) revert LocalMockLiquidityAdapterInvalidQuoteAsset();
        if (liquidityRecipient == address(0)) {
            revert LocalMockLiquidityAdapterInvalidLiquidityRecipient();
        }
        if (launchTokenAmount == 0) {
            revert LocalMockLiquidityAdapterInvalidLaunchTokenAmount();
        }
        if (quoteAssetAmount == 0) {
            revert LocalMockLiquidityAdapterInvalidQuoteAssetAmount();
        }

        IERC20(launchToken).safeTransferFrom(msg.sender, address(this), launchTokenAmount);
        IERC20(quoteAsset).safeTransferFrom(msg.sender, address(this), quoteAssetAmount);

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

        lastCaller = msg.sender;
        lastLaunchToken = launchToken;
        lastQuoteAsset = quoteAsset;
        lastLaunchTokenAmount = launchTokenAmount;
        lastQuoteAssetAmount = quoteAssetAmount;
        lastLiquidityRecipient = liquidityRecipient;
        lastMigrationId = migrationId;
    }
}

/// @notice Local-only deployment script for wiring the existing LibrARC protocol together on chain ID 31337.
contract DeployLocalLibrARC is Script {
    error LocalOnlyChainRequired(uint256 actualChainId);
    error LocalDeploymentInvalidAdmin();
    error LocalDeploymentInvalidTreasury();
    error LocalDeploymentInvalidLiquidityRecipient();
    error LocalDeploymentValidationFailed(string checkName);

    struct DeploymentResult {
        address quoteAsset;
        address feeVault;
        address liquidityAdapter;
        address launchFactory;
        address admin;
        address treasury;
        address liquidityRecipient;
    }

    uint256 public constant LOCAL_CHAIN_ID = 31_337;

    // Local-test-only fixtures. These are not production economic parameters.
    uint48 public constant LOCAL_ADMIN_TRANSFER_DELAY = 1 days;
    uint256 public constant LOCAL_VIRTUAL_USDC_RESERVE = 10_000 * 10 ** 6;
    uint256 public constant LOCAL_VIRTUAL_TOKEN_RESERVE = 1_000_000_000 * 10 ** 18;
    uint256 public constant LOCAL_BUY_FEE_BPS = 100;
    uint256 public constant LOCAL_SELL_FEE_BPS = 100;
    uint256 public constant LOCAL_GRADUATION_THRESHOLD = 1000 * 10 ** 6;
    uint256 public constant LOCAL_MAX_METADATA_URI_LENGTH = 500;

    address public constant DEFAULT_LOCAL_ADMIN = address(0xA11CE);
    address public constant DEFAULT_LOCAL_TREASURY = address(0xBEEF);
    address public constant DEFAULT_LOCAL_LIQUIDITY_RECIPIENT = address(0xF00D);

    function run() external returns (DeploymentResult memory result) {
        result = deployLocalProtocol(
            DEFAULT_LOCAL_ADMIN, DEFAULT_LOCAL_TREASURY, DEFAULT_LOCAL_LIQUIDITY_RECIPIENT
        );
        _printDeploymentResult(result);
    }

    function deployLocalProtocol(address admin, address treasury, address liquidityRecipient)
        public
        returns (DeploymentResult memory result)
    {
        _requireLocalChain();
        if (admin == address(0)) revert LocalDeploymentInvalidAdmin();
        if (treasury == address(0)) revert LocalDeploymentInvalidTreasury();
        if (liquidityRecipient == address(0)) {
            revert LocalDeploymentInvalidLiquidityRecipient();
        }

        LocalMockArcUsdc quoteAsset = new LocalMockArcUsdc();
        LocalMockLiquidityAdapter liquidityAdapter = new LocalMockLiquidityAdapter();
        FeeVault feeVault = new FeeVault(admin, treasury, LOCAL_ADMIN_TRANSFER_DELAY);
        LaunchFactory launchFactory = new LaunchFactory(
            admin,
            LOCAL_ADMIN_TRANSFER_DELAY,
            address(quoteAsset),
            address(feeVault),
            address(liquidityAdapter),
            liquidityRecipient,
            LOCAL_VIRTUAL_USDC_RESERVE,
            LOCAL_VIRTUAL_TOKEN_RESERVE,
            LOCAL_BUY_FEE_BPS,
            LOCAL_SELL_FEE_BPS,
            LOCAL_GRADUATION_THRESHOLD,
            LOCAL_MAX_METADATA_URI_LENGTH
        );

        result = DeploymentResult({
            quoteAsset: address(quoteAsset),
            feeVault: address(feeVault),
            liquidityAdapter: address(liquidityAdapter),
            launchFactory: address(launchFactory),
            admin: admin,
            treasury: treasury,
            liquidityRecipient: liquidityRecipient
        });

        _validateDeployment(result);
    }

    function _requireLocalChain() internal view {
        if (block.chainid != LOCAL_CHAIN_ID) revert LocalOnlyChainRequired(block.chainid);
    }

    function _validateDeployment(DeploymentResult memory result) internal view {
        LocalMockArcUsdc quoteAsset = LocalMockArcUsdc(result.quoteAsset);
        FeeVault feeVault = FeeVault(payable(result.feeVault));
        LaunchFactory launchFactory = LaunchFactory(payable(result.launchFactory));

        if (result.quoteAsset == address(0)) {
            revert LocalDeploymentValidationFailed("quoteAsset");
        }
        if (result.feeVault == address(0)) revert LocalDeploymentValidationFailed("feeVault");
        if (result.liquidityAdapter == address(0)) {
            revert LocalDeploymentValidationFailed("liquidityAdapter");
        }
        if (result.launchFactory == address(0)) {
            revert LocalDeploymentValidationFailed("launchFactory");
        }
        if (feeVault.treasury() != result.treasury) {
            revert LocalDeploymentValidationFailed("feeVault treasury");
        }
        if (feeVault.defaultAdmin() != result.admin) {
            revert LocalDeploymentValidationFailed("feeVault admin");
        }
        if (!feeVault.hasRole(feeVault.DEFAULT_ADMIN_ROLE(), result.admin)) {
            revert LocalDeploymentValidationFailed("feeVault admin role");
        }
        if (!feeVault.hasRole(feeVault.TREASURY_MANAGER_ROLE(), result.admin)) {
            revert LocalDeploymentValidationFailed("feeVault treasury manager role");
        }
        if (!feeVault.hasRole(feeVault.WITHDRAWER_ROLE(), result.admin)) {
            revert LocalDeploymentValidationFailed("feeVault withdrawer role");
        }
        if (launchFactory.defaultAdmin() != result.admin) {
            revert LocalDeploymentValidationFailed("factory admin");
        }
        if (!launchFactory.hasRole(launchFactory.DEFAULT_ADMIN_ROLE(), result.admin)) {
            revert LocalDeploymentValidationFailed("factory admin role");
        }
        if (!launchFactory.hasRole(launchFactory.PAUSER_ROLE(), result.admin)) {
            revert LocalDeploymentValidationFailed("factory pauser role");
        }
        if (launchFactory.quoteAsset() != result.quoteAsset) {
            revert LocalDeploymentValidationFailed("factory quote asset");
        }
        if (launchFactory.feeVault() != result.feeVault) {
            revert LocalDeploymentValidationFailed("factory fee vault");
        }
        if (launchFactory.liquidityAdapter() != result.liquidityAdapter) {
            revert LocalDeploymentValidationFailed("factory liquidity adapter");
        }
        if (launchFactory.liquidityRecipient() != result.liquidityRecipient) {
            revert LocalDeploymentValidationFailed("factory liquidity recipient");
        }
        if (launchFactory.virtualUsdcReserve() != LOCAL_VIRTUAL_USDC_RESERVE) {
            revert LocalDeploymentValidationFailed("factory virtual usdc reserve");
        }
        if (launchFactory.virtualTokenReserve() != LOCAL_VIRTUAL_TOKEN_RESERVE) {
            revert LocalDeploymentValidationFailed("factory virtual token reserve");
        }
        if (launchFactory.buyFeeBps() != LOCAL_BUY_FEE_BPS) {
            revert LocalDeploymentValidationFailed("factory buy fee");
        }
        if (launchFactory.sellFeeBps() != LOCAL_SELL_FEE_BPS) {
            revert LocalDeploymentValidationFailed("factory sell fee");
        }
        if (launchFactory.graduationThreshold() != LOCAL_GRADUATION_THRESHOLD) {
            revert LocalDeploymentValidationFailed("factory graduation threshold");
        }
        if (launchFactory.maxMetadataUriLength() != LOCAL_MAX_METADATA_URI_LENGTH) {
            revert LocalDeploymentValidationFailed("factory max metadata");
        }
        if (launchFactory.launchCount() != 0) {
            revert LocalDeploymentValidationFailed("factory launch count");
        }
        if (quoteAsset.totalSupply() != 0) {
            revert LocalDeploymentValidationFailed("mock usdc total supply");
        }
        if (quoteAsset.balanceOf(result.quoteAsset) != 0) {
            revert LocalDeploymentValidationFailed("quote asset self balance");
        }
        if (quoteAsset.balanceOf(result.feeVault) != 0) {
            revert LocalDeploymentValidationFailed("fee vault quote balance");
        }
        if (quoteAsset.balanceOf(result.launchFactory) != 0) {
            revert LocalDeploymentValidationFailed("factory quote balance");
        }
        if (quoteAsset.balanceOf(result.admin) != 0) {
            revert LocalDeploymentValidationFailed("admin quote balance");
        }
        if (quoteAsset.balanceOf(result.treasury) != 0) {
            revert LocalDeploymentValidationFailed("treasury quote balance");
        }
        if (quoteAsset.balanceOf(result.liquidityRecipient) != 0) {
            revert LocalDeploymentValidationFailed("liquidity recipient quote balance");
        }
    }

    function _printDeploymentResult(DeploymentResult memory result) internal view {
        console2.log("LOCAL ONLY LibrARC deployment");
        console2.log("chainId");
        console2.logUint(block.chainid);
        console2.log("quoteAsset");
        console2.logAddress(result.quoteAsset);
        console2.log("feeVault");
        console2.logAddress(result.feeVault);
        console2.log("liquidityAdapter");
        console2.logAddress(result.liquidityAdapter);
        console2.log("launchFactory");
        console2.logAddress(result.launchFactory);
        console2.log("admin");
        console2.logAddress(result.admin);
        console2.log("treasury");
        console2.logAddress(result.treasury);
        console2.log("liquidityRecipient");
        console2.logAddress(result.liquidityRecipient);
    }
}
