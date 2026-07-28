// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ILiquidityAdapter} from "./interfaces/ILiquidityAdapter.sol";
import {BondingCurveMath} from "./libraries/BondingCurveMath.sol";

/// @title LaunchPool
/// @notice Phase 1 LaunchPool for LibrARC token launches.
/// @dev This phase stores immutable pool configuration, internal reserve accounting, one-time initialization,
/// lifecycle state, and view-only quote functions. It intentionally does not execute trading, fee sweeping,
/// or liquidity migration.
contract LaunchPool {
    /// @notice Lifecycle states for the launch pool.
    enum PoolStatus {
        Uninitialized,
        Active,
        GraduationPending,
        Graduated
    }

    error ZeroFactory();
    error ZeroLaunchToken();
    error ZeroQuoteAsset();
    error ZeroFeeVault();
    error ZeroLiquidityAdapter();
    error ZeroLiquidityRecipient();
    error ZeroTotalTokenSupply();
    error ZeroVirtualUsdcReserve();
    error ZeroVirtualTokenReserve();
    error InvalidBuyFeeBps();
    error InvalidSellFeeBps();
    error ZeroGraduationThreshold();
    error UnauthorizedFactory(address caller, address expectedFactory);
    error PoolAlreadyInitialized(PoolStatus currentStatus);
    error PoolNotActive(PoolStatus currentStatus);
    error InvalidTokenTotalSupply(uint256 actualTotalSupply, uint256 expectedTotalSupply);
    error InsufficientTokenFunding(uint256 actualBalance, uint256 requiredBalance);
    error GraduationThresholdExceeded(uint256 currentRealUsdcReserve, uint256 netUsdcIn, uint256 graduationThreshold);
    error NativeAssetNotAccepted();

    /// @notice Emitted when the pool is successfully initialized with its fixed launch-token inventory.
    /// @param launchToken The launch-token ERC-20 address for this pool.
    /// @param totalTokenSupply The accounted fixed token supply assigned to the pool.
    /// @param virtualUsdcReserve The immutable virtual USDC reserve used for pricing.
    /// @param virtualTokenReserve The immutable virtual token reserve used for pricing.
    event PoolInitialized(
        address indexed launchToken, uint256 totalTokenSupply, uint256 virtualUsdcReserve, uint256 virtualTokenReserve
    );

    /// @notice The factory allowed to perform one-time initialization.
    address public immutable factory;

    /// @notice The launch-token ERC-20 for this pool.
    IERC20 public immutable launchToken;

    /// @notice The quote-asset ERC-20 for this pool.
    IERC20 public immutable quoteAsset;

    /// @notice The protocol fee vault configured for future phases.
    address public immutable feeVault;

    /// @notice The liquidity adapter configured for future graduation.
    ILiquidityAdapter public immutable liquidityAdapter;

    /// @notice The recipient configured for future migrated liquidity.
    address public immutable liquidityRecipient;

    /// @notice The immutable total launch-token supply accounted by the pool.
    uint256 public immutable totalTokenSupply;

    /// @notice The immutable virtual USDC reserve used for buy and sell quotes.
    uint256 public immutable virtualUsdcReserve;

    /// @notice The immutable virtual token reserve used for buy and sell quotes.
    uint256 public immutable virtualTokenReserve;

    /// @notice The immutable buy fee in basis points.
    uint256 public immutable buyFeeBps;

    /// @notice The immutable sell fee in basis points.
    uint256 public immutable sellFeeBps;

    /// @notice The immutable graduation threshold in 6-decimal quote-asset units.
    uint256 public immutable graduationThreshold;

    /// @notice The current pool lifecycle status.
    PoolStatus public status;

    uint256 internal _realUsdcReserve;
    uint256 internal _realTokenReserve;
    uint256 internal _accruedProtocolFees;

    /// @notice Creates a new Phase 1 LaunchPool with immutable launch configuration.
    /// @param factory_ The factory authorized to call `initialize()`.
    /// @param launchToken_ The launch-token ERC-20 address.
    /// @param quoteAsset_ The quote-asset ERC-20 address.
    /// @param feeVault_ The fee vault address reserved for future phases.
    /// @param liquidityAdapter_ The liquidity adapter address reserved for future graduation.
    /// @param liquidityRecipient_ The recipient for future migrated liquidity.
    /// @param totalTokenSupply_ The fixed launch-token supply expected to fund the pool.
    /// @param virtualUsdcReserve_ The immutable virtual USDC reserve used for pricing.
    /// @param virtualTokenReserve_ The immutable virtual token reserve used for pricing.
    /// @param buyFeeBps_ The immutable buy fee in basis points.
    /// @param sellFeeBps_ The immutable sell fee in basis points.
    /// @param graduationThreshold_ The immutable graduation threshold in quote-asset units.
    constructor(
        address factory_,
        address launchToken_,
        address quoteAsset_,
        address feeVault_,
        address liquidityAdapter_,
        address liquidityRecipient_,
        uint256 totalTokenSupply_,
        uint256 virtualUsdcReserve_,
        uint256 virtualTokenReserve_,
        uint256 buyFeeBps_,
        uint256 sellFeeBps_,
        uint256 graduationThreshold_
    ) {
        if (factory_ == address(0)) revert ZeroFactory();
        if (launchToken_ == address(0)) revert ZeroLaunchToken();
        if (quoteAsset_ == address(0)) revert ZeroQuoteAsset();
        if (feeVault_ == address(0)) revert ZeroFeeVault();
        if (liquidityAdapter_ == address(0)) revert ZeroLiquidityAdapter();
        if (liquidityRecipient_ == address(0)) revert ZeroLiquidityRecipient();
        if (totalTokenSupply_ == 0) revert ZeroTotalTokenSupply();
        if (virtualUsdcReserve_ == 0) revert ZeroVirtualUsdcReserve();
        if (virtualTokenReserve_ == 0) revert ZeroVirtualTokenReserve();
        if (buyFeeBps_ >= BondingCurveMath.BPS_DENOMINATOR) revert InvalidBuyFeeBps();
        if (sellFeeBps_ >= BondingCurveMath.BPS_DENOMINATOR) revert InvalidSellFeeBps();
        if (graduationThreshold_ == 0) revert ZeroGraduationThreshold();

        factory = factory_;
        launchToken = IERC20(launchToken_);
        quoteAsset = IERC20(quoteAsset_);
        feeVault = feeVault_;
        liquidityAdapter = ILiquidityAdapter(liquidityAdapter_);
        liquidityRecipient = liquidityRecipient_;
        totalTokenSupply = totalTokenSupply_;
        virtualUsdcReserve = virtualUsdcReserve_;
        virtualTokenReserve = virtualTokenReserve_;
        buyFeeBps = buyFeeBps_;
        sellFeeBps = sellFeeBps_;
        graduationThreshold = graduationThreshold_;
        status = PoolStatus.Uninitialized;
    }

    /// @notice Performs one-time pool initialization after the factory has funded the full token supply.
    /// @dev Validates token supply and pool launch-token funding without counting excess donated tokens in internal
    /// accounting, then transitions the pool from `Uninitialized` to `Active`.
    function initialize() external {
        if (msg.sender != factory) revert UnauthorizedFactory(msg.sender, factory);
        if (status != PoolStatus.Uninitialized) revert PoolAlreadyInitialized(status);

        uint256 actualTotalSupply = launchToken.totalSupply();
        if (actualTotalSupply != totalTokenSupply) {
            revert InvalidTokenTotalSupply(actualTotalSupply, totalTokenSupply);
        }

        uint256 launchTokenBalance = launchToken.balanceOf(address(this));
        if (launchTokenBalance < totalTokenSupply) {
            revert InsufficientTokenFunding(launchTokenBalance, totalTokenSupply);
        }

        BondingCurveMath.CurveState memory nextState = BondingCurveMath.CurveState({
            realUsdcReserve: 0,
            realTokenReserve: totalTokenSupply,
            virtualUsdcReserve: virtualUsdcReserve,
            virtualTokenReserve: virtualTokenReserve,
            accruedProtocolFees: 0
        });

        BondingCurveMath.validateInitialization(nextState, totalTokenSupply);

        _realTokenReserve = totalTokenSupply;
        status = PoolStatus.Active;

        emit PoolInitialized(address(launchToken), totalTokenSupply, virtualUsdcReserve, virtualTokenReserve);
    }

    /// @notice Returns a view-only buy quote from the current internal curve state.
    /// @param usdcAmountIn The gross quote-asset input amount in 6-decimal units.
    /// @return quote The computed buy quote and its resulting next curve state.
    /// @return reachesGraduationThreshold True only when the next accounted reserve equals the graduation threshold.
    function quoteBuy(uint256 usdcAmountIn)
        external
        view
        returns (BondingCurveMath.BuyQuote memory quote, bool reachesGraduationThreshold)
    {
        if (status != PoolStatus.Active) revert PoolNotActive(status);

        BondingCurveMath.CurveState memory currentState = curveState();
        quote = BondingCurveMath.quoteBuy(currentState, usdcAmountIn, buyFeeBps);

        if (quote.nextState.realUsdcReserve > graduationThreshold) {
            revert GraduationThresholdExceeded(currentState.realUsdcReserve, quote.netUsdcIn, graduationThreshold);
        }

        reachesGraduationThreshold = quote.nextState.realUsdcReserve == graduationThreshold;
    }

    /// @notice Returns a view-only sell quote from the current internal curve state.
    /// @param tokenAmountIn The launch-token input amount in 18-decimal units.
    /// @return quote The computed sell quote and its resulting next curve state.
    function quoteSell(uint256 tokenAmountIn) external view returns (BondingCurveMath.SellQuote memory quote) {
        if (status != PoolStatus.Active) revert PoolNotActive(status);

        quote = BondingCurveMath.quoteSell(curveState(), tokenAmountIn, sellFeeBps, totalTokenSupply);
    }

    /// @notice Returns the current authoritative internal curve-accounting state.
    /// @return state The internal accounted reserves, virtual reserves, and accrued protocol fees.
    function curveState() public view returns (BondingCurveMath.CurveState memory state) {
        state = BondingCurveMath.CurveState({
            realUsdcReserve: _realUsdcReserve,
            realTokenReserve: _realTokenReserve,
            virtualUsdcReserve: virtualUsdcReserve,
            virtualTokenReserve: virtualTokenReserve,
            accruedProtocolFees: _accruedProtocolFees
        });
    }

    /// @notice Returns the remaining graduation capacity from internal accounting only.
    /// @return capacity The remaining quote-asset capacity before the pool reaches graduation.
    function remainingGraduationCapacity() external view returns (uint256 capacity) {
        capacity = graduationThreshold - _realUsdcReserve;
    }

    /// @notice Returns whether trading is currently active for future execution phases.
    /// @return active True only when the pool status is `Active`.
    function isTradingActive() external view returns (bool active) {
        active = status == PoolStatus.Active;
    }

    receive() external payable {
        revert NativeAssetNotAccepted();
    }

    fallback() external payable {
        revert NativeAssetNotAccepted();
    }
}
