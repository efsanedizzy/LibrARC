// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {BondingCurveMath} from "./libraries/BondingCurveMath.sol";
import {LaunchPool} from "./LaunchPool.sol";
import {LibrARCToken} from "./LibrARCToken.sol";

/// @title LaunchFactory
/// @notice Permissionless factory for atomically deploying LibrARC fixed-supply tokens and dedicated launch pools.
/// @dev This Phase 1 implementation only handles launch creation, registry writes, metadata-reference validation,
/// and launch-creation pause controls. It does not implement creator initial purchases, graduation, or fee sweeping.
contract LaunchFactory is AccessControlDefaultAdminRules, Pausable {
    /// @notice Registry record stored for every successful launch.
    /// @param creator The address that requested the launch.
    /// @param token The deployed fixed-supply launch-token address.
    /// @param pool The deployed LaunchPool address paired with the token.
    /// @param metadataHash The keccak256 hash of the off-chain metadata reference.
    struct LaunchRecord {
        address creator;
        address token;
        address pool;
        bytes32 metadataHash;
    }

    error ZeroAdmin();
    error ZeroAdminTransferDelay();
    error ZeroQuoteAsset();
    error ZeroFeeVault();
    error ZeroLiquidityAdapter();
    error ZeroLiquidityRecipient();
    error ZeroVirtualUsdcReserve();
    error ZeroVirtualTokenReserve();
    error InvalidBuyFeeBps();
    error InvalidSellFeeBps();
    error ZeroGraduationThreshold();
    error ZeroMaxMetadataUriLength();
    error EmptyMetadataUri();
    error MetadataUriTooLong(uint256 actualLength, uint256 maxLength);
    error FactoryTokenBalanceNotZero(uint256 remainingBalance);
    error InvalidPoolInitialization();
    error TokenTransferFailed();
    error NativeAssetNotAccepted();

    /// @notice Role allowed to pause and unpause new launch creation.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Emitted after a launch token and LaunchPool are created and registered successfully.
    /// @param launchId The monotonically increasing launch identifier.
    /// @param creator The address that requested the launch.
    /// @param launchToken The deployed launch-token address.
    /// @param launchPool The deployed LaunchPool address.
    /// @param name The ERC-20 token name used during deployment.
    /// @param symbol The ERC-20 token symbol used during deployment.
    /// @param metadataUri The off-chain metadata reference emitted for indexing.
    /// @param metadataHash The keccak256 hash of `metadataUri`.
    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed launchToken,
        address launchPool,
        string name,
        string symbol,
        string metadataUri,
        bytes32 metadataHash
    );

    /// @notice The protocol quote-asset address configured for every new pool.
    address public immutable quoteAsset;

    /// @notice The protocol FeeVault address configured for every new pool.
    address public immutable feeVault;

    /// @notice The liquidity adapter address configured for every new pool.
    address public immutable liquidityAdapter;

    /// @notice The liquidity recipient configured for every new pool.
    address public immutable liquidityRecipient;

    /// @notice The virtual USDC reserve configured for every new pool.
    uint256 public immutable virtualUsdcReserve;

    /// @notice The virtual token reserve configured for every new pool.
    uint256 public immutable virtualTokenReserve;

    /// @notice The buy fee in basis points configured for every new pool.
    uint256 public immutable buyFeeBps;

    /// @notice The sell fee in basis points configured for every new pool.
    uint256 public immutable sellFeeBps;

    /// @notice The graduation threshold configured for every new pool.
    uint256 public immutable graduationThreshold;

    /// @notice The maximum allowed metadata URI length for launch creation.
    uint256 public immutable maxMetadataUriLength;

    /// @notice The number of successfully created launches.
    uint256 public launchCount;

    /// @notice Registry lookup from launch ID to launch record.
    mapping(uint256 launchId => LaunchRecord) public launchById;

    /// @notice Reverse lookup from token address to pool address.
    mapping(address token => address pool) public poolByToken;

    /// @notice Reverse lookup from pool address to token address.
    mapping(address pool => address token) public tokenByPool;

    /// @notice Whether a token address was created by this factory.
    mapping(address token => bool) public isLibrarcToken;

    /// @notice Whether a pool address was created by this factory.
    mapping(address pool => bool) public isLibrarcPool;

    /// @notice Creates a LaunchFactory with immutable launch-parameter configuration and pause controls.
    /// @param initialAdmin_ The initial default admin and pauser.
    /// @param adminTransferDelay_ The delayed two-step default-admin transfer delay.
    /// @param quoteAsset_ The quote-asset address configured for every new LaunchPool.
    /// @param feeVault_ The FeeVault address configured for every new LaunchPool.
    /// @param liquidityAdapter_ The liquidity adapter configured for every new LaunchPool.
    /// @param liquidityRecipient_ The liquidity recipient configured for every new LaunchPool.
    /// @param virtualUsdcReserve_ The virtual USDC reserve configured for every new LaunchPool.
    /// @param virtualTokenReserve_ The virtual token reserve configured for every new LaunchPool.
    /// @param buyFeeBps_ The buy fee configured for every new LaunchPool.
    /// @param sellFeeBps_ The sell fee configured for every new LaunchPool.
    /// @param graduationThreshold_ The graduation threshold configured for every new LaunchPool.
    /// @param maxMetadataUriLength_ The maximum allowed metadata URI length.
    constructor(
        address initialAdmin_,
        uint48 adminTransferDelay_,
        address quoteAsset_,
        address feeVault_,
        address liquidityAdapter_,
        address liquidityRecipient_,
        uint256 virtualUsdcReserve_,
        uint256 virtualTokenReserve_,
        uint256 buyFeeBps_,
        uint256 sellFeeBps_,
        uint256 graduationThreshold_,
        uint256 maxMetadataUriLength_
    )
        AccessControlDefaultAdminRules(
            _validateAdminTransferDelay(adminTransferDelay_), _validateInitialAdmin(initialAdmin_)
        )
    {
        if (quoteAsset_ == address(0)) revert ZeroQuoteAsset();
        if (feeVault_ == address(0)) revert ZeroFeeVault();
        if (liquidityAdapter_ == address(0)) revert ZeroLiquidityAdapter();
        if (liquidityRecipient_ == address(0)) revert ZeroLiquidityRecipient();
        if (virtualUsdcReserve_ == 0) revert ZeroVirtualUsdcReserve();
        if (virtualTokenReserve_ == 0) revert ZeroVirtualTokenReserve();
        if (buyFeeBps_ >= BondingCurveMath.BPS_DENOMINATOR) revert InvalidBuyFeeBps();
        if (sellFeeBps_ >= BondingCurveMath.BPS_DENOMINATOR) revert InvalidSellFeeBps();
        if (graduationThreshold_ == 0) revert ZeroGraduationThreshold();
        if (maxMetadataUriLength_ == 0) revert ZeroMaxMetadataUriLength();

        quoteAsset = quoteAsset_;
        feeVault = feeVault_;
        liquidityAdapter = liquidityAdapter_;
        liquidityRecipient = liquidityRecipient_;
        virtualUsdcReserve = virtualUsdcReserve_;
        virtualTokenReserve = virtualTokenReserve_;
        buyFeeBps = buyFeeBps_;
        sellFeeBps = sellFeeBps_;
        graduationThreshold = graduationThreshold_;
        maxMetadataUriLength = maxMetadataUriLength_;

        _grantRole(PAUSER_ROLE, initialAdmin_);
    }

    /// @notice Creates a new fixed-supply launch token and dedicated LaunchPool atomically.
    /// @param name_ The ERC-20 token name for the new launch token.
    /// @param symbol_ The ERC-20 token symbol for the new launch token.
    /// @param metadataUri_ The off-chain metadata reference for indexing.
    /// @return launchToken The deployed launch-token address.
    /// @return launchPool The deployed LaunchPool address.
    /// @return launchId The new monotonic launch identifier.
    function createLaunch(string calldata name_, string calldata symbol_, string calldata metadataUri_)
        external
        whenNotPaused
        returns (address launchToken, address launchPool, uint256 launchId)
    {
        bytes memory metadataUriBytes = bytes(metadataUri_);
        _validateMetadataUri(metadataUriBytes);

        bytes32 metadataHash = keccak256(metadataUriBytes);

        LibrARCToken tokenInstance = new LibrARCToken(name_, symbol_, address(this));
        uint256 fixedSupply = tokenInstance.FIXED_SUPPLY();
        if (tokenInstance.balanceOf(address(this)) != fixedSupply) {
            revert InvalidPoolInitialization();
        }

        LaunchPool poolInstance = new LaunchPool(
            address(this),
            address(tokenInstance),
            quoteAsset,
            feeVault,
            liquidityAdapter,
            liquidityRecipient,
            fixedSupply,
            virtualUsdcReserve,
            virtualTokenReserve,
            buyFeeBps,
            sellFeeBps,
            graduationThreshold
        );

        if (!tokenInstance.transfer(address(poolInstance), fixedSupply)) {
            revert TokenTransferFailed();
        }

        poolInstance.initialize();

        uint256 factoryTokenBalance = tokenInstance.balanceOf(address(this));
        if (factoryTokenBalance != 0) revert FactoryTokenBalanceNotZero(factoryTokenBalance);

        BondingCurveMath.CurveState memory state = poolInstance.curveState();
        if (
            uint256(poolInstance.status()) != uint256(LaunchPool.PoolStatus.Active)
                || state.realTokenReserve != fixedSupply || state.realUsdcReserve != 0 || state.accruedProtocolFees != 0
        ) revert InvalidPoolInitialization();

        launchToken = address(tokenInstance);
        launchPool = address(poolInstance);
        launchId = launchCount + 1;

        launchById[launchId] =
            LaunchRecord({creator: msg.sender, token: launchToken, pool: launchPool, metadataHash: metadataHash});
        poolByToken[launchToken] = launchPool;
        tokenByPool[launchPool] = launchToken;
        isLibrarcToken[launchToken] = true;
        isLibrarcPool[launchPool] = true;
        launchCount = launchId;

        emit LaunchCreated(launchId, msg.sender, launchToken, launchPool, name_, symbol_, metadataUri_, metadataHash);
    }

    /// @notice Pauses new launch creation without affecting existing launch pools.
    function pauseLaunchCreation() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpauses new launch creation.
    function unpauseLaunchCreation() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    receive() external payable {
        revert NativeAssetNotAccepted();
    }

    fallback() external payable {
        revert NativeAssetNotAccepted();
    }

    function _validateMetadataUri(bytes memory metadataUriBytes) internal view {
        uint256 metadataUriLength = metadataUriBytes.length;
        if (metadataUriLength == 0) revert EmptyMetadataUri();
        if (metadataUriLength > maxMetadataUriLength) {
            revert MetadataUriTooLong(metadataUriLength, maxMetadataUriLength);
        }
    }

    function _validateInitialAdmin(address initialAdmin_) private pure returns (address) {
        if (initialAdmin_ == address(0)) revert ZeroAdmin();
        return initialAdmin_;
    }

    function _validateAdminTransferDelay(uint48 adminTransferDelay_) private pure returns (uint48) {
        if (adminTransferDelay_ == 0) revert ZeroAdminTransferDelay();
        return adminTransferDelay_;
    }
}
