// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Test } from "forge-std/Test.sol";

import { FeeVault } from "../src/FeeVault.sol";
import { LaunchFactory } from "../src/LaunchFactory.sol";
import { DeployArcTestnet } from "../script/DeployArcTestnet.s.sol";

contract MockArcQuoteAsset is ERC20 {
    uint8 private immutable _mockDecimals;

    constructor(uint8 mockDecimals_) ERC20("Mock Arc USDC", "USDC") {
        _mockDecimals = mockDecimals_;
    }

    function decimals() public view override returns (uint8) {
        return _mockDecimals;
    }
}

contract MockReviewedLiquidityAdapter {
    function ping() external pure returns (bool) {
        return true;
    }
}

contract DeployArcTestnetHarness is DeployArcTestnet {
    function deployWithExplicitConfig(address quoteAsset, DeploymentConfig memory config)
        external
        returns (DeploymentResult memory result)
    {
        _requireArcTestnetChain();
        _validateDeploymentConfig(config);
        _validateQuoteAsset(quoteAsset);
        _validateLiquidityAdapter(config.liquidityAdapter);
        result = _deployContracts(config, quoteAsset);
        _validateDeploymentResult(result, config, quoteAsset);
    }

    function exposedRequireArcTestnetChain() external view {
        _requireArcTestnetChain();
    }

    function exposedValidateDeploymentConfig(DeploymentConfig memory config) external pure {
        _validateDeploymentConfig(config);
    }

    function exposedValidateQuoteAsset(address quoteAsset) external view {
        _validateQuoteAsset(quoteAsset);
    }

    function exposedValidateLiquidityAdapter(address liquidityAdapter) external view {
        _validateLiquidityAdapter(liquidityAdapter);
    }
}

contract DeployArcTestnetTest is Test {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    address internal constant ADMIN = address(0xA11CE);
    address internal constant TREASURY = address(0xBEEF);
    address internal constant LIQUIDITY_RECIPIENT = address(0xF00D);

    uint48 internal constant ADMIN_TRANSFER_DELAY = 1 days;
    uint256 internal constant VIRTUAL_USDC_RESERVE = 10_000 * 10 ** 6;
    uint256 internal constant VIRTUAL_TOKEN_RESERVE = 1_000_000_000 * 10 ** 18;
    uint256 internal constant BUY_FEE_BPS = 100;
    uint256 internal constant SELL_FEE_BPS = 150;
    uint256 internal constant GRADUATION_THRESHOLD = 1000 * 10 ** 6;
    uint256 internal constant MAX_METADATA_URI_LENGTH = 500;

    DeployArcTestnetHarness internal harness;
    MockArcQuoteAsset internal quoteAsset;
    MockReviewedLiquidityAdapter internal liquidityAdapter;

    function setUp() public {
        vm.chainId(ARC_TESTNET_CHAIN_ID);
        harness = new DeployArcTestnetHarness();
        quoteAsset = new MockArcQuoteAsset(6);
        liquidityAdapter = new MockReviewedLiquidityAdapter();
    }

    function test_CorrectArcChainIdSucceeds() public {
        harness.exposedRequireArcTestnetChain();
    }

    function test_IncorrectChainIdReverts() public {
        vm.chainId(1);

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployArcTestnet.ArcTestnetOnlyChainSupported.selector, uint256(1)
            )
        );
        harness.exposedRequireArcTestnetChain();
    }

    function test_ZeroAdminReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.admin = address(0);

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidAdmin.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_ZeroTreasuryReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.treasury = address(0);

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidTreasury.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_ZeroLiquidityAdapterReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.liquidityAdapter = address(0);

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidLiquidityAdapter.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_AdapterWithoutCodeReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployArcTestnet.ArcTestnetLiquidityAdapterMissingCode.selector, address(0x1234)
            )
        );
        harness.exposedValidateLiquidityAdapter(address(0x1234));
    }

    function test_ZeroLiquidityRecipientReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.liquidityRecipient = address(0);

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidLiquidityRecipient.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_ZeroAdminDelayReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.adminTransferDelay = 0;

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidAdminTransferDelay.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_ZeroVirtualUsdcReserveReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.virtualUsdcReserve = 0;

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidVirtualUsdcReserve.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_ZeroVirtualTokenReserveReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.virtualTokenReserve = 0;

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidVirtualTokenReserve.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_BuyFeeEqualToTenThousandReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.buyFeeBps = 10_000;

        vm.expectRevert(
            abi.encodeWithSelector(DeployArcTestnet.ArcTestnetInvalidBuyFeeBps.selector, 10_000)
        );
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_BuyFeeAboveTenThousandReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.buyFeeBps = 10_001;

        vm.expectRevert(
            abi.encodeWithSelector(DeployArcTestnet.ArcTestnetInvalidBuyFeeBps.selector, 10_001)
        );
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_SellFeeEqualToTenThousandReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.sellFeeBps = 10_000;

        vm.expectRevert(
            abi.encodeWithSelector(DeployArcTestnet.ArcTestnetInvalidSellFeeBps.selector, 10_000)
        );
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_SellFeeAboveTenThousandReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.sellFeeBps = 10_001;

        vm.expectRevert(
            abi.encodeWithSelector(DeployArcTestnet.ArcTestnetInvalidSellFeeBps.selector, 10_001)
        );
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_ZeroGraduationThresholdReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.graduationThreshold = 0;

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidGraduationThreshold.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_ZeroMetadataUriLengthReverts() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        config.maxMetadataUriLength = 0;

        vm.expectRevert(DeployArcTestnet.ArcTestnetInvalidMaxMetadataUriLength.selector);
        harness.exposedValidateDeploymentConfig(config);
    }

    function test_QuoteAssetWithoutCodeReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployArcTestnet.ArcTestnetQuoteAssetMissingCode.selector, address(0x5678)
            )
        );
        harness.exposedValidateQuoteAsset(address(0x5678));
    }

    function test_QuoteAssetWithWrongDecimalsReverts() public {
        MockArcQuoteAsset wrongDecimalsQuoteAsset = new MockArcQuoteAsset(18);

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployArcTestnet.ArcTestnetQuoteAssetInvalidDecimals.selector, uint8(18)
            )
        );
        harness.exposedValidateQuoteAsset(address(wrongDecimalsQuoteAsset));
    }

    function test_ValidLocalConfigurationDeploysFeeVaultAndLaunchFactory() public {
        DeployArcTestnet.DeploymentConfig memory config = _defaultConfig();
        DeployArcTestnet.DeploymentResult memory result =
            harness.deployWithExplicitConfig(address(quoteAsset), config);

        FeeVault feeVault = FeeVault(payable(result.feeVault));
        LaunchFactory launchFactory = LaunchFactory(payable(result.launchFactory));

        assertTrue(result.feeVault != address(0));
        assertTrue(result.launchFactory != address(0));
        assertEq(result.quoteAsset, address(quoteAsset));
        assertEq(result.liquidityAdapter, address(liquidityAdapter));
        assertEq(result.admin, config.admin);
        assertEq(result.treasury, config.treasury);
        assertEq(result.liquidityRecipient, config.liquidityRecipient);

        assertEq(feeVault.treasury(), config.treasury);
        assertEq(feeVault.defaultAdmin(), config.admin);
        assertTrue(feeVault.hasRole(feeVault.DEFAULT_ADMIN_ROLE(), config.admin));
        assertTrue(feeVault.hasRole(feeVault.TREASURY_MANAGER_ROLE(), config.admin));
        assertTrue(feeVault.hasRole(feeVault.WITHDRAWER_ROLE(), config.admin));

        assertEq(launchFactory.defaultAdmin(), config.admin);
        assertTrue(launchFactory.hasRole(launchFactory.DEFAULT_ADMIN_ROLE(), config.admin));
        assertTrue(launchFactory.hasRole(launchFactory.PAUSER_ROLE(), config.admin));
        assertEq(launchFactory.quoteAsset(), address(quoteAsset));
        assertEq(launchFactory.feeVault(), result.feeVault);
        assertEq(launchFactory.liquidityAdapter(), address(liquidityAdapter));
        assertEq(launchFactory.liquidityRecipient(), config.liquidityRecipient);
        assertEq(launchFactory.virtualUsdcReserve(), config.virtualUsdcReserve);
        assertEq(launchFactory.virtualTokenReserve(), config.virtualTokenReserve);
        assertEq(launchFactory.buyFeeBps(), config.buyFeeBps);
        assertEq(launchFactory.sellFeeBps(), config.sellFeeBps);
        assertEq(launchFactory.graduationThreshold(), config.graduationThreshold);
        assertEq(launchFactory.maxMetadataUriLength(), config.maxMetadataUriLength);
        assertEq(launchFactory.launchCount(), 0);

        assertEq(quoteAsset.balanceOf(address(this)), 0);
        assertFalse(launchFactory.isLibrarcToken(address(this)));
        assertFalse(launchFactory.isLibrarcPool(address(this)));
    }

    function _defaultConfig() internal view returns (DeployArcTestnet.DeploymentConfig memory) {
        return DeployArcTestnet.DeploymentConfig({
            admin: ADMIN,
            treasury: TREASURY,
            liquidityAdapter: address(liquidityAdapter),
            liquidityRecipient: LIQUIDITY_RECIPIENT,
            adminTransferDelay: ADMIN_TRANSFER_DELAY,
            virtualUsdcReserve: VIRTUAL_USDC_RESERVE,
            virtualTokenReserve: VIRTUAL_TOKEN_RESERVE,
            buyFeeBps: BUY_FEE_BPS,
            sellFeeBps: SELL_FEE_BPS,
            graduationThreshold: GRADUATION_THRESHOLD,
            maxMetadataUriLength: MAX_METADATA_URI_LENGTH
        });
    }
}
