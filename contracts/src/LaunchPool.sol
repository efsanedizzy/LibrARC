// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { ILiquidityAdapter } from "./interfaces/ILiquidityAdapter.sol";
import { BondingCurveMath } from "./libraries/BondingCurveMath.sol";

/// @title LaunchPool
/// @notice Launch pool for LibrARC token launches with bonding-curve trading and permissionless graduation.
/// @dev This phase stores immutable pool configuration, internal reserve accounting, one-time initialization,
/// lifecycle state, public trading, and atomic adapter-based liquidity graduation.
contract LaunchPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

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
    error ZeroBuyer();
    error InvalidBuyFeeBps();
    error InvalidSellFeeBps();
    error ZeroGraduationThreshold();
    error UnauthorizedFactory(address caller, address expectedFactory);
    error PoolAlreadyInitialized(PoolStatus currentStatus);
    error PoolNotActive(PoolStatus currentStatus);
    error PoolNotGraduationPending(PoolStatus currentStatus);
    error InvalidTokenTotalSupply(uint256 actualTotalSupply, uint256 expectedTotalSupply);
    error InsufficientTokenFunding(uint256 actualBalance, uint256 requiredBalance);
    error GraduationThresholdExceeded(
        uint256 currentRealUsdcReserve, uint256 netUsdcIn, uint256 graduationThreshold
    );
    error ZeroGraduationTokenReserve();
    error ZeroGraduationUsdcReserve();
    error InsufficientLaunchTokenBalance(uint256 actualBalance, uint256 requiredBalance);
    error InsufficientQuoteAssetBalance(uint256 actualBalance, uint256 requiredBalance);
    error ZeroMigrationId();
    error LaunchTokenMigrationBalanceMismatch(uint256 expectedBalance, uint256 actualBalance);
    error QuoteAssetMigrationBalanceMismatch(uint256 expectedBalance, uint256 actualBalance);
    error LaunchTokenAllowanceNotCleared(uint256 remainingAllowance);
    error QuoteAssetAllowanceNotCleared(uint256 remainingAllowance);
    error ProtocolFeeAccountingChanged(
        uint256 expectedAccruedProtocolFees, uint256 actualAccruedProtocolFees
    );
    error PoolNotInitialized();
    error NoProtocolFees();
    error ProtocolFeeSweepBalanceMismatch(
        uint256 expectedPoolQuoteAssetBalance,
        uint256 actualPoolQuoteAssetBalance,
        uint256 expectedFeeVaultQuoteAssetBalance,
        uint256 actualFeeVaultQuoteAssetBalance
    );
    error BuysPaused();
    error AllTradingPaused();
    error PauseStateUnchanged();
    error PauseChangeNotAllowed();
    error ZeroRecipient();
    error ExpiredDeadline(uint256 currentTimestamp, uint256 deadline);
    error InsufficientTokenOutput(uint256 minimumTokenAmountOut, uint256 actualTokenAmountOut);
    error InsufficientUsdcOutput(uint256 minimumUsdcAmountOut, uint256 actualUsdcAmountOut);
    error NativeAssetNotAccepted();

    /// @notice Emitted when the pool is successfully initialized with its fixed launch-token inventory.
    /// @param launchToken The launch-token ERC-20 address for this pool.
    /// @param totalTokenSupply The accounted fixed token supply assigned to the pool.
    /// @param virtualUsdcReserve The immutable virtual USDC reserve used for pricing.
    /// @param virtualTokenReserve The immutable virtual token reserve used for pricing.
    event PoolInitialized(
        address indexed launchToken,
        uint256 totalTokenSupply,
        uint256 virtualUsdcReserve,
        uint256 virtualTokenReserve
    );

    /// @notice Emitted when a buy executes successfully.
    /// @param buyer The address paying quote asset into the pool.
    /// @param recipient The address receiving launch tokens.
    /// @param usdcAmountIn The gross quote-asset input amount.
    /// @param fee The protocol fee retained in the pool.
    /// @param netUsdcIn The quote-asset amount added to real reserves.
    /// @param tokenAmountOut The launch-token amount transferred to the recipient.
    /// @param realUsdcReserve The resulting accounted real USDC reserve.
    /// @param realTokenReserve The resulting accounted real token reserve.
    event BuyExecuted(
        address indexed buyer,
        address indexed recipient,
        uint256 usdcAmountIn,
        uint256 fee,
        uint256 netUsdcIn,
        uint256 tokenAmountOut,
        uint256 realUsdcReserve,
        uint256 realTokenReserve
    );

    /// @notice Emitted when a sell executes successfully.
    /// @param seller The address paying launch tokens into the pool.
    /// @param recipient The address receiving quote asset.
    /// @param tokenAmountIn The launch-token input amount.
    /// @param grossUsdcAmountOut The gross quote-asset amount removed from real reserves.
    /// @param fee The protocol fee retained in the pool.
    /// @param netUsdcAmountOut The quote-asset amount transferred to the recipient.
    /// @param realUsdcReserve The resulting accounted real USDC reserve.
    /// @param realTokenReserve The resulting accounted real token reserve.
    event SellExecuted(
        address indexed seller,
        address indexed recipient,
        uint256 tokenAmountIn,
        uint256 grossUsdcAmountOut,
        uint256 fee,
        uint256 netUsdcAmountOut,
        uint256 realUsdcReserve,
        uint256 realTokenReserve
    );

    /// @notice Emitted when an exact-threshold buy permanently disables trading and awaits graduation.
    /// @param realUsdcReserve The accounted real USDC reserve after the threshold-reaching buy.
    /// @param graduationThreshold The configured graduation threshold.
    event GraduationPendingEntered(uint256 realUsdcReserve, uint256 graduationThreshold);

    /// @notice Emitted after a successful one-time migration of user-backed reserves through the liquidity adapter.
    /// @param caller The permissionless caller that finalized graduation.
    /// @param liquidityAdapter The immutable adapter that pulled the migrated assets.
    /// @param liquidityRecipient The immutable recipient for the resulting liquidity position or claim.
    /// @param migrationId The non-zero identifier returned by the adapter.
    /// @param launchTokenAmount The exact launch-token amount migrated from internal real reserves.
    /// @param quoteAssetAmount The exact quote-asset amount migrated from internal real reserves.
    /// @param accruedProtocolFeesRemaining The protocol-owned fees intentionally left in the pool.
    event GraduationCompleted(
        address indexed caller,
        address indexed liquidityAdapter,
        address indexed liquidityRecipient,
        bytes32 migrationId,
        uint256 launchTokenAmount,
        uint256 quoteAssetAmount,
        uint256 accruedProtocolFeesRemaining
    );

    /// @notice Emitted when the complete accrued protocol-fee balance is swept to the immutable fee vault.
    /// @param caller The permissionless caller that triggered the sweep.
    /// @param feeVault The immutable fee-vault recipient.
    /// @param amount The exact protocol-fee amount transferred.
    event ProtocolFeesSwept(address indexed caller, address indexed feeVault, uint256 amount);

    /// @notice Emitted when the factory changes the buy-pause flag for an active pool.
    /// @param paused The new stored buy-pause state.
    /// @param factoryCaller The immutable factory caller that applied the change.
    event BuysPauseUpdated(bool paused, address indexed factoryCaller);

    /// @notice Emitted when the factory changes the all-trading-pause flag for an active pool.
    /// @param paused The new stored all-trading-pause state.
    /// @param factoryCaller The immutable factory caller that applied the change.
    event AllTradingPauseUpdated(bool paused, address indexed factoryCaller);

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

    /// @notice True when buy execution is paused for the active pool.
    bool public buysPaused;

    /// @notice True when all trade execution is paused for the active pool.
    bool public allTradingPaused;

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

        emit PoolInitialized(
            address(launchToken), totalTokenSupply, virtualUsdcReserve, virtualTokenReserve
        );
    }

    /// @notice Finalizes graduation by migrating only the user-backed real reserves through the immutable adapter.
    /// @dev This function is permissionless, non-payable, and retryable after adapter failure because any reverted
    /// migration restores the pre-call `GraduationPending` state, balances, and allowances.
    /// @return migrationId The non-zero adapter identifier for the completed migration.
    function graduate() external nonReentrant returns (bytes32 migrationId) {
        if (status != PoolStatus.GraduationPending) revert PoolNotGraduationPending(status);

        uint256 launchTokenAmount = _realTokenReserve;
        if (launchTokenAmount == 0) revert ZeroGraduationTokenReserve();

        uint256 quoteAssetAmount = _realUsdcReserve;
        if (quoteAssetAmount == 0) revert ZeroGraduationUsdcReserve();

        uint256 accruedProtocolFees = _accruedProtocolFees;
        uint256 launchTokenBalanceBefore = launchToken.balanceOf(address(this));
        uint256 quoteAssetBalanceBefore = quoteAsset.balanceOf(address(this));
        uint256 requiredQuoteCoverage = quoteAssetAmount + accruedProtocolFees;

        if (launchTokenBalanceBefore < launchTokenAmount) {
            revert InsufficientLaunchTokenBalance(launchTokenBalanceBefore, launchTokenAmount);
        }
        if (quoteAssetBalanceBefore < requiredQuoteCoverage) {
            revert InsufficientQuoteAssetBalance(quoteAssetBalanceBefore, requiredQuoteCoverage);
        }

        status = PoolStatus.Graduated;
        _realTokenReserve = 0;
        _realUsdcReserve = 0;

        launchToken.forceApprove(address(liquidityAdapter), launchTokenAmount);
        quoteAsset.forceApprove(address(liquidityAdapter), quoteAssetAmount);

        migrationId = liquidityAdapter.migrateLiquidity(
            address(launchToken),
            address(quoteAsset),
            launchTokenAmount,
            quoteAssetAmount,
            liquidityRecipient
        );
        if (migrationId == bytes32(0)) revert ZeroMigrationId();

        launchToken.forceApprove(address(liquidityAdapter), 0);
        quoteAsset.forceApprove(address(liquidityAdapter), 0);

        uint256 remainingLaunchTokenAllowance =
            launchToken.allowance(address(this), address(liquidityAdapter));
        if (remainingLaunchTokenAllowance != 0) {
            revert LaunchTokenAllowanceNotCleared(remainingLaunchTokenAllowance);
        }

        uint256 remainingQuoteAssetAllowance =
            quoteAsset.allowance(address(this), address(liquidityAdapter));
        if (remainingQuoteAssetAllowance != 0) {
            revert QuoteAssetAllowanceNotCleared(remainingQuoteAssetAllowance);
        }

        uint256 launchTokenBalanceAfter = launchToken.balanceOf(address(this));
        uint256 expectedLaunchTokenBalanceAfter = launchTokenBalanceBefore - launchTokenAmount;
        if (launchTokenBalanceAfter != expectedLaunchTokenBalanceAfter) {
            revert LaunchTokenMigrationBalanceMismatch(
                expectedLaunchTokenBalanceAfter, launchTokenBalanceAfter
            );
        }

        uint256 quoteAssetBalanceAfter = quoteAsset.balanceOf(address(this));
        uint256 expectedQuoteAssetBalanceAfter = quoteAssetBalanceBefore - quoteAssetAmount;
        if (quoteAssetBalanceAfter != expectedQuoteAssetBalanceAfter) {
            revert QuoteAssetMigrationBalanceMismatch(
                expectedQuoteAssetBalanceAfter, quoteAssetBalanceAfter
            );
        }

        if (_accruedProtocolFees != accruedProtocolFees) {
            revert ProtocolFeeAccountingChanged(accruedProtocolFees, _accruedProtocolFees);
        }

        emit GraduationCompleted(
            msg.sender,
            address(liquidityAdapter),
            liquidityRecipient,
            migrationId,
            launchTokenAmount,
            quoteAssetAmount,
            accruedProtocolFees
        );
    }

    /// @notice Sweeps the complete accrued protocol-fee balance to the immutable fee vault.
    /// @dev This function is permissionless and preserves all user-backed reserve accounting, pricing inputs, and pool
    /// lifecycle state.
    /// @return amountSwept The exact accrued protocol-fee amount transferred to the fee vault.
    function sweepProtocolFees() external nonReentrant returns (uint256 amountSwept) {
        PoolStatus currentStatus = status;
        if (currentStatus == PoolStatus.Uninitialized) revert PoolNotInitialized();

        amountSwept = _accruedProtocolFees;
        if (amountSwept == 0) revert NoProtocolFees();

        uint256 realUsdcReserveBefore = _realUsdcReserve;
        uint256 realTokenReserveBefore = _realTokenReserve;
        uint256 virtualUsdcReserveBefore = virtualUsdcReserve;
        uint256 virtualTokenReserveBefore = virtualTokenReserve;
        uint256 remainingGraduationCapacityBefore = _remainingGraduationCapacity();
        uint256 poolQuoteAssetBalanceBefore = quoteAsset.balanceOf(address(this));
        uint256 feeVaultQuoteAssetBalanceBefore = quoteAsset.balanceOf(feeVault);
        uint256 requiredQuoteCoverage = realUsdcReserveBefore + amountSwept;

        if (poolQuoteAssetBalanceBefore < requiredQuoteCoverage) {
            revert InsufficientQuoteAssetBalance(poolQuoteAssetBalanceBefore, requiredQuoteCoverage);
        }

        _accruedProtocolFees = 0;

        quoteAsset.safeTransfer(feeVault, amountSwept);

        uint256 poolQuoteAssetBalanceAfter = quoteAsset.balanceOf(address(this));
        uint256 feeVaultQuoteAssetBalanceAfter = quoteAsset.balanceOf(feeVault);
        uint256 expectedPoolQuoteAssetBalanceAfter = poolQuoteAssetBalanceBefore - amountSwept;
        uint256 expectedFeeVaultQuoteAssetBalanceAfter =
            feeVaultQuoteAssetBalanceBefore + amountSwept;

        if (
            poolQuoteAssetBalanceAfter != expectedPoolQuoteAssetBalanceAfter
                || feeVaultQuoteAssetBalanceAfter != expectedFeeVaultQuoteAssetBalanceAfter
        ) {
            revert ProtocolFeeSweepBalanceMismatch(
                expectedPoolQuoteAssetBalanceAfter,
                poolQuoteAssetBalanceAfter,
                expectedFeeVaultQuoteAssetBalanceAfter,
                feeVaultQuoteAssetBalanceAfter
            );
        }

        assert(_realUsdcReserve == realUsdcReserveBefore);
        assert(_realTokenReserve == realTokenReserveBefore);
        assert(virtualUsdcReserve == virtualUsdcReserveBefore);
        assert(virtualTokenReserve == virtualTokenReserveBefore);
        assert(status == currentStatus);
        assert(_remainingGraduationCapacity() == remainingGraduationCapacityBefore);

        emit ProtocolFeesSwept(msg.sender, feeVault, amountSwept);
    }

    /// @notice Sets whether public and factory-mediated buys are paused for this active pool.
    /// @dev Only the immutable factory may call this function.
    /// @param paused_ The new buy-pause state.
    function setBuysPaused(bool paused_) external {
        if (msg.sender != factory) revert UnauthorizedFactory(msg.sender, factory);
        if (status != PoolStatus.Active) revert PauseChangeNotAllowed();
        if (buysPaused == paused_) revert PauseStateUnchanged();

        buysPaused = paused_;

        emit BuysPauseUpdated(paused_, msg.sender);
    }

    /// @notice Sets whether all trade execution is paused for this active pool.
    /// @dev Only the immutable factory may call this function.
    /// @param paused_ The new all-trading-pause state.
    function setAllTradingPaused(bool paused_) external {
        if (msg.sender != factory) revert UnauthorizedFactory(msg.sender, factory);
        if (status != PoolStatus.Active) revert PauseChangeNotAllowed();
        if (allTradingPaused == paused_) revert PauseStateUnchanged();

        allTradingPaused = paused_;

        emit AllTradingPauseUpdated(paused_, msg.sender);
    }

    /// @notice Executes a buy against the current internal bonding-curve state.
    /// @param usdcAmountIn The gross quote-asset input amount in 6-decimal units.
    /// @param minTokenAmountOut The minimum acceptable launch-token output amount.
    /// @param deadline The latest timestamp at which the trade remains valid.
    /// @param recipient The address receiving the launch tokens.
    /// @return tokenAmountOut The exact launch-token output amount transferred to the recipient.
    function buy(
        uint256 usdcAmountIn,
        uint256 minTokenAmountOut,
        uint256 deadline,
        address recipient
    ) external nonReentrant returns (uint256 tokenAmountOut) {
        tokenAmountOut = _executeBuy(
            msg.sender, msg.sender, recipient, usdcAmountIn, minTokenAmountOut, deadline
        );
    }

    /// @notice Executes a factory-mediated buy that preserves the original creator as the recorded buyer.
    /// @param buyer The original creator or user on whose behalf the factory is purchasing.
    /// @param usdcAmountIn The gross quote-asset input amount in 6-decimal units.
    /// @param minTokenAmountOut The minimum acceptable launch-token output amount.
    /// @param deadline The latest timestamp at which the trade remains valid.
    /// @param recipient The address receiving the launch tokens.
    /// @return tokenAmountOut The exact launch-token output amount transferred to the recipient.
    function buyForFactory(
        address buyer,
        uint256 usdcAmountIn,
        uint256 minTokenAmountOut,
        uint256 deadline,
        address recipient
    ) external nonReentrant returns (uint256 tokenAmountOut) {
        if (msg.sender != factory) {
            revert UnauthorizedFactory(msg.sender, factory);
        }
        if (buyer == address(0)) revert ZeroBuyer();

        tokenAmountOut =
            _executeBuy(msg.sender, buyer, recipient, usdcAmountIn, minTokenAmountOut, deadline);
    }

    /// @notice Executes a sell against the current internal bonding-curve state.
    /// @param tokenAmountIn The launch-token input amount in 18-decimal units.
    /// @param minUsdcAmountOut The minimum acceptable net quote-asset output amount.
    /// @param deadline The latest timestamp at which the trade remains valid.
    /// @param recipient The address receiving quote asset.
    /// @return netUsdcAmountOut The exact quote-asset amount transferred to the recipient.
    function sell(
        uint256 tokenAmountIn,
        uint256 minUsdcAmountOut,
        uint256 deadline,
        address recipient
    ) external nonReentrant returns (uint256 netUsdcAmountOut) {
        _requireActiveStatus();
        _requireSellExecutionAllowed();
        if (recipient == address(0)) revert ZeroRecipient();
        if (block.timestamp > deadline) revert ExpiredDeadline(block.timestamp, deadline);
        if (tokenAmountIn == 0) revert BondingCurveMath.ZeroInput();

        BondingCurveMath.SellQuote memory quote =
            BondingCurveMath.quoteSell(curveState(), tokenAmountIn, sellFeeBps, totalTokenSupply);
        netUsdcAmountOut = quote.netUsdcAmountOut;

        if (netUsdcAmountOut < minUsdcAmountOut) {
            revert InsufficientUsdcOutput(minUsdcAmountOut, netUsdcAmountOut);
        }

        _setCurveState(quote.nextState);

        launchToken.safeTransferFrom(msg.sender, address(this), tokenAmountIn);
        quoteAsset.safeTransfer(recipient, netUsdcAmountOut);

        emit SellExecuted(
            msg.sender,
            recipient,
            tokenAmountIn,
            quote.grossUsdcAmountOut,
            quote.fee,
            netUsdcAmountOut,
            quote.nextState.realUsdcReserve,
            quote.nextState.realTokenReserve
        );
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
            revert GraduationThresholdExceeded(
                currentState.realUsdcReserve, quote.netUsdcIn, graduationThreshold
            );
        }

        reachesGraduationThreshold = quote.nextState.realUsdcReserve == graduationThreshold;
    }

    /// @notice Returns a view-only sell quote from the current internal curve state.
    /// @param tokenAmountIn The launch-token input amount in 18-decimal units.
    /// @return quote The computed sell quote and its resulting next curve state.
    function quoteSell(uint256 tokenAmountIn)
        external
        view
        returns (BondingCurveMath.SellQuote memory quote)
    {
        if (status != PoolStatus.Active) revert PoolNotActive(status);

        quote =
            BondingCurveMath.quoteSell(curveState(), tokenAmountIn, sellFeeBps, totalTokenSupply);
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
        capacity = _remainingGraduationCapacity();
    }

    /// @notice Returns whether trading is currently active for future execution phases.
    /// @return active True only when the pool status is `Active`.
    function isTradingActive() external view returns (bool active) {
        active = status == PoolStatus.Active;
    }

    /// @notice Returns whether buys are currently executable.
    /// @return buyable True only when the pool is active, buys are not paused, and all trading is not paused.
    function canBuy() external view returns (bool buyable) {
        buyable = status == PoolStatus.Active && !buysPaused && !allTradingPaused;
    }

    /// @notice Returns whether sells are currently executable.
    /// @return sellable True only when the pool is active and all trading is not paused.
    function canSell() external view returns (bool sellable) {
        sellable = status == PoolStatus.Active && !allTradingPaused;
    }

    function _executeBuy(
        address payer,
        address buyer,
        address recipient,
        uint256 usdcAmountIn,
        uint256 minTokenAmountOut,
        uint256 deadline
    ) internal returns (uint256 tokenAmountOut) {
        _requireActiveStatus();
        _requireBuyExecutionAllowed();
        if (recipient == address(0)) revert ZeroRecipient();
        if (block.timestamp > deadline) revert ExpiredDeadline(block.timestamp, deadline);
        if (usdcAmountIn == 0) revert BondingCurveMath.ZeroInput();

        BondingCurveMath.CurveState memory currentState = curveState();
        BondingCurveMath.BuyQuote memory quote =
            BondingCurveMath.quoteBuy(currentState, usdcAmountIn, buyFeeBps);
        tokenAmountOut = quote.tokenAmountOut;

        if (tokenAmountOut < minTokenAmountOut) {
            revert InsufficientTokenOutput(minTokenAmountOut, tokenAmountOut);
        }
        if (quote.nextState.realUsdcReserve > graduationThreshold) {
            revert GraduationThresholdExceeded(
                currentState.realUsdcReserve, quote.netUsdcIn, graduationThreshold
            );
        }

        _setCurveState(quote.nextState);

        bool entersGraduationPending = quote.nextState.realUsdcReserve == graduationThreshold;
        if (entersGraduationPending) {
            status = PoolStatus.GraduationPending;
        }

        quoteAsset.safeTransferFrom(payer, address(this), usdcAmountIn);
        launchToken.safeTransfer(recipient, tokenAmountOut);

        emit BuyExecuted(
            buyer,
            recipient,
            usdcAmountIn,
            quote.fee,
            quote.netUsdcIn,
            tokenAmountOut,
            quote.nextState.realUsdcReserve,
            quote.nextState.realTokenReserve
        );

        if (entersGraduationPending) {
            emit GraduationPendingEntered(quote.nextState.realUsdcReserve, graduationThreshold);
        }
    }

    function _requireActiveStatus() internal view {
        if (status != PoolStatus.Active) revert PoolNotActive(status);
    }

    function _requireBuyExecutionAllowed() internal view {
        if (allTradingPaused) revert AllTradingPaused();
        if (buysPaused) revert BuysPaused();
    }

    function _requireSellExecutionAllowed() internal view {
        if (allTradingPaused) revert AllTradingPaused();
    }

    function _setCurveState(BondingCurveMath.CurveState memory nextState) internal {
        _realUsdcReserve = nextState.realUsdcReserve;
        _realTokenReserve = nextState.realTokenReserve;
        _accruedProtocolFees = nextState.accruedProtocolFees;
    }

    function _remainingGraduationCapacity() internal view returns (uint256 capacity) {
        capacity = graduationThreshold - _realUsdcReserve;
    }

    receive() external payable {
        revert NativeAssetNotAccepted();
    }

    fallback() external payable {
        revert NativeAssetNotAccepted();
    }
}
