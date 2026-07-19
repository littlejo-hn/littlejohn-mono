// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {ILittleJohnRouter, ILittleJohnPairFactory} from "./interfaces/ILittleJohnRouter.sol";

/// @title Launchpad
/// @notice LittleJohn's pump.fun-style bonding-curve launchpad. Every token
///         trades on a constant-product curve with virtual reserves:
///
///             virtualEth * virtualToken = k
///
///         Curve constants mirror pump.fun (18-decimal denomination): 1B supply,
///         1.073B initial virtual token reserve, 793.1M sold along the curve,
///         206.9M reserved for the graduation pool. When the curve sells out the
///         token graduates atomically: the reserved tokens are paired with the
///         raised ETH (minus a flat migration fee) into a LittleJohn ve(3,3)
///         volatile pool and the LP is burned to the dead address (liquidity
///         locked forever).
///
///         Graduation is always atomic with the final buy, the router is a
///         required config slot, never zero, so there is no window in which a
///         graduated-but-unmigrated token can be griefed into a skewed pool.
contract Launchpad is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    // ---------------------------------------------------------------- consts

    /// @dev pump.fun parameters, 18-decimal denomination.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant CURVE_SUPPLY = 793_100_000e18;
    uint256 public constant LP_SUPPLY = TOTAL_SUPPLY - CURVE_SUPPLY; // 206.9M
    uint256 public constant INITIAL_VIRTUAL_TOKEN = 1_073_000_000e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500; // 5%
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ---------------------------------------------------------------- state

    struct Curve {
        uint128 virtualEth;
        uint128 virtualToken;
        uint128 realEth; // ETH held for this curve (excludes fees already paid out)
        uint128 tokensSold; // cumulative tokens sold out of CURVE_SUPPLY
        bool graduated;
        address creator;
        // Fees are snapshotted at creation so an owner config change can never
        // alter the economics of a launch that is already live.
        uint16 protocolFeeBps;
        uint16 creatorFeeBps;
        // Anti-snipe launch fee, snapshotted per launch (same reasoning as the
        // base fees): a buy-only premium that decays linearly to zero over
        // `snipeWindow` seconds from `launchTime`, routed entirely to the band.
        uint40 launchTime;
        uint16 snipeStartBps;
        uint32 snipeWindow;
    }

    /// @notice Beacon whose implementation backs every launched LaunchToken.
    address public tokenBeacon;
    address public feeRecipient;
    /// @notice LittleJohn Router used for graduation liquidity. Required non-zero.
    address public dexRouter;
    /// @notice Default protocol fee (bps) applied to newly created curves.
    uint16 public protocolFeeBps;
    /// @notice Default creator fee (bps) applied to newly created curves.
    uint16 public creatorFeeBps;
    /// @notice Flat fee (wei) charged on token creation.
    uint96 public creationFee;
    /// @notice Initial virtual ETH reserve for new curves, sets launch price
    ///         and the ETH raised at graduation.
    uint128 public initialVirtualEth;
    /// @notice Flat fee (wei) skimmed from the raise at graduation.
    uint128 public migrationFee;

    mapping(address => Curve) public curves;
    address[] public allTokens;

    /// @notice Accrued, unclaimed creator fees (pull pattern, a reverting
    ///         creator must not be able to block trading).
    mapping(address => uint256) public creatorFees;

    /// @dev Storage reentrancy lock (kept storage-based; we don't assume the
    ///      target chain supports transient storage).
    uint256 private _locked;

    modifier nonReentrant() {
        if (_locked == 2) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ---------------------------------------------------------------- events

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string metadataURI,
        uint256 virtualEth,
        uint256 virtualToken
    );

    /// @dev Post-trade reserves are emitted so indexers derive spot price with
    ///      no extra RPC calls.
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 virtualEth,
        uint256 virtualToken,
        uint256 tokensSold
    );

    event CreatorFeesClaimed(address indexed creator, uint256 amount);
    event Graduated(address indexed token, uint256 ethLiquidity, uint256 tokenLiquidity);
    event Migrated(address indexed token, address indexed pair, uint256 ethAdded, uint256 tokensAdded, uint256 migrationFee);
    event ConfigUpdated(
        address feeRecipient,
        address dexRouter,
        uint16 protocolFeeBps,
        uint16 creatorFeeBps,
        uint96 creationFee,
        uint128 initialVirtualEth,
        uint128 migrationFee,
        uint16 snipeStartBps,
        uint32 snipeWindow
    );

    // ---------------------------------------------------------------- errors

    error Reentrancy();
    error UnknownToken();
    error AlreadyGraduated();
    error ZeroAmount();
    error SlippageExceeded();
    error InsufficientCreationFee();
    error FeeTooHigh();
    error SnipeFeeTooHigh();
    error RouterRequired();
    error EthTransferFailed();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address tokenBeacon_,
        address feeRecipient_,
        address dexRouter_,
        uint16 protocolFeeBps_,
        uint16 creatorFeeBps_,
        uint96 creationFee_,
        uint128 initialVirtualEth_,
        uint128 migrationFee_,
        uint16 snipeStartBps_,
        uint32 snipeWindow_
    ) external initializer {
        if (uint256(protocolFeeBps_) + creatorFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        // Cap the launch-window premium so premium + base can never exceed 100%
        // of the buy (else ethIn would underflow and brick the token's buys).
        if (uint256(snipeStartBps_) + protocolFeeBps_ + creatorFeeBps_ > BPS) revert SnipeFeeTooHigh();
        if (dexRouter_ == address(0)) revert RouterRequired();
        __Ownable_init(owner_);
        __Ownable2Step_init();
        _locked = 1;

        tokenBeacon = tokenBeacon_;
        feeRecipient = feeRecipient_;
        dexRouter = dexRouter_;
        protocolFeeBps = protocolFeeBps_;
        creatorFeeBps = creatorFeeBps_;
        creationFee = creationFee_;
        initialVirtualEth = initialVirtualEth_;
        migrationFee = migrationFee_;
        snipeStartBps = snipeStartBps_;
        snipeWindow = snipeWindow_;
    }

    /// @notice Accepts the ETH-dust refund the Router sends back after a
    ///         graduation liquidity add. No other ETH path relies on this.
    receive() external payable {}

    // ------------------------------------------------------------- creation

    /// @notice Launch a new token. ETH beyond the creation fee is an initial
    ///         "dev buy" for the creator.
    function createToken(string calldata name, string calldata symbol, string calldata metadataURI)
        external
        payable
        nonReentrant
        returns (address token)
    {
        if (msg.value < creationFee) revert InsufficientCreationFee();

        token = address(
            new BeaconProxy(
                tokenBeacon,
                abi.encodeCall(LaunchToken.initialize, (name, symbol, metadataURI, TOTAL_SUPPLY, address(this)))
            )
        );

        curves[token] = Curve({
            virtualEth: initialVirtualEth,
            virtualToken: uint128(INITIAL_VIRTUAL_TOKEN),
            realEth: 0,
            tokensSold: 0,
            graduated: false,
            creator: msg.sender,
            protocolFeeBps: protocolFeeBps,
            creatorFeeBps: creatorFeeBps,
            launchTime: uint40(block.timestamp),
            snipeStartBps: snipeStartBps,
            snipeWindow: snipeWindow
        });
        allTokens.push(token);

        emit TokenCreated(token, msg.sender, name, symbol, metadataURI, initialVirtualEth, INITIAL_VIRTUAL_TOKEN);

        if (creationFee > 0) _sendEth(feeRecipient, creationFee);

        uint256 buyAmount = msg.value - creationFee;
        if (buyAmount > 0) _buy(token, msg.sender, buyAmount, 0);
    }

    // -------------------------------------------------------------- trading

    /// @notice Buy `token` with the attached ETH; reverts under `minTokensOut`.
    ///         Excess ETH on the graduating buy is refunded.
    function buy(address token, uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        return _buy(token, msg.sender, msg.value, minTokensOut);
    }

    /// @notice Sell `tokenAmount` back into the curve.
    function sell(address token, uint256 tokenAmount, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        Curve storage c = _activeCurve(token);
        if (tokenAmount == 0) revert ZeroAmount();

        // Round the post-trade reserve up so ETH out rounds down (protocol
        // favouring), dust rounding must never let the curve pay out more.
        uint256 k = uint256(c.virtualEth) * c.virtualToken;
        uint256 grossEth = uint256(c.virtualEth) - _ceilDiv(k, uint256(c.virtualToken) + tokenAmount);
        (uint256 protocolFee, uint256 creatorFee) = _splitFee(grossEth, c.protocolFeeBps, c.creatorFeeBps);
        ethOut = grossEth - protocolFee - creatorFee;
        if (ethOut < minEthOut) revert SlippageExceeded();

        c.virtualEth -= uint128(grossEth);
        c.virtualToken += uint128(tokenAmount);
        c.realEth -= uint128(grossEth);
        c.tokensSold -= uint128(tokenAmount);

        LaunchToken(token).transferFrom(msg.sender, address(this), tokenAmount);

        emit Trade(token, msg.sender, false, ethOut, tokenAmount, protocolFee, creatorFee, c.virtualEth, c.virtualToken, c.tokensSold);

        if (creatorFee > 0) creatorFees[c.creator] += creatorFee;
        if (protocolFee > 0) _sendEth(feeRecipient, protocolFee);
        _sendEth(msg.sender, ethOut);
    }

    function _buy(address token, address recipient, uint256 ethSent, uint256 minTokensOut)
        internal
        returns (uint256 tokensOut)
    {
        Curve storage c = _activeCurve(token);
        if (ethSent == 0) revert ZeroAmount();

        uint256 pBps = _snipePremiumBps(c);
        (uint256 protocolFee, uint256 creatorFee) = _splitFee(ethSent, c.protocolFeeBps, c.creatorFeeBps);
        protocolFee += _ceilDiv(ethSent * pBps, BPS); // anti-snipe premium, routed to the band
        uint256 ethIn = ethSent - protocolFee - creatorFee;

        uint256 k = uint256(c.virtualEth) * c.virtualToken;
        tokensOut = uint256(c.virtualToken) - _ceilDiv(k, uint256(c.virtualEth) + ethIn);

        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        uint256 refund;
        if (tokensOut >= remaining) {
            // Final buy: clamp to what's left, charge (and fee) only the ETH
            // actually needed, refund the rest.
            tokensOut = remaining;
            uint256 ethNeeded = _ceilDiv(k, uint256(c.virtualToken) - remaining) - c.virtualEth;
            (protocolFee, creatorFee) = _splitFee(ethNeeded, c.protocolFeeBps, c.creatorFeeBps);
            protocolFee += _ceilDiv(ethNeeded * pBps, BPS); // premium on the ETH actually spent
            uint256 charged = ethNeeded + protocolFee + creatorFee;
            if (charged > ethSent) {
                // Ceil rounding can push the recomputed charge a wei past what
                // was sent on an exact-boundary buy; absorb it rather than
                // underflow the refund.
                ethNeeded -= charged - ethSent;
                charged = ethSent;
            }
            refund = ethSent - charged;
            ethIn = ethNeeded;
        }
        if (tokensOut < minTokensOut) revert SlippageExceeded();
        if (tokensOut == 0) revert ZeroAmount();

        c.virtualEth += uint128(ethIn);
        c.virtualToken -= uint128(tokensOut);
        c.realEth += uint128(ethIn);
        c.tokensSold += uint128(tokensOut);

        LaunchToken(token).transfer(recipient, tokensOut);

        emit Trade(token, recipient, true, ethIn, tokensOut, protocolFee, creatorFee, c.virtualEth, c.virtualToken, c.tokensSold);

        if (creatorFee > 0) creatorFees[c.creator] += creatorFee;
        if (protocolFee > 0) _sendEth(feeRecipient, protocolFee);
        if (refund > 0) _sendEth(recipient, refund);

        if (c.tokensSold == CURVE_SUPPLY) _graduate(token, c);
    }

    // ----------------------------------------------------------- graduation

    function _graduate(address token, Curve storage c) internal {
        c.graduated = true;
        LaunchToken(token).markGraduated();
        emit Graduated(token, c.realEth, LP_SUPPLY);
        _migrate(token, c);
    }

    function _migrate(address token, Curve storage c) internal {
        uint256 raised = c.realEth;
        c.realEth = 0;

        uint256 mFee = migrationFee < raised ? migrationFee : 0;
        uint256 ethLiquidity = raised - mFee;

        ILittleJohnRouter router = ILittleJohnRouter(dexRouter);
        LaunchToken(token).approve(dexRouter, LP_SUPPLY);
        // volatile (stable = false) TOKEN/WETH pool; LP burned to DEAD.
        (uint256 amountToken, uint256 amountETH,) =
            router.addLiquidityETH{value: ethLiquidity}(token, false, LP_SUPPLY, 0, 0, DEAD, block.timestamp);

        if (mFee > 0) _sendEth(feeRecipient, mFee);

        address pair = ILittleJohnPairFactory(router.factory()).getPair(token, router.weth(), false);
        emit Migrated(token, pair, amountETH, amountToken, mFee);
    }

    // ----------------------------------------------------------- creator fees

    /// @notice Withdraw accrued creator fees (ETH).
    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        amount = creatorFees[msg.sender];
        if (amount == 0) revert ZeroAmount();
        creatorFees[msg.sender] = 0;
        _sendEth(msg.sender, amount);
        emit CreatorFeesClaimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function getCurve(address token) external view returns (Curve memory) {
        return curves[token];
    }

    /// @notice Spot price in wei per whole token (1e18 base units).
    function getPrice(address token) external view returns (uint256) {
        Curve storage c = curves[token];
        if (c.creator == address(0)) revert UnknownToken();
        return (uint256(c.virtualEth) * 1e18) / c.virtualToken;
    }

    /// @notice Quote a buy: tokens out for `ethAmount` (fees included).
    function quoteBuy(address token, uint256 ethAmount) external view returns (uint256 tokensOut) {
        Curve storage c = curves[token];
        if (c.creator == address(0)) revert UnknownToken();
        (uint256 protocolFee, uint256 creatorFee) = _splitFee(ethAmount, c.protocolFeeBps, c.creatorFeeBps);
        protocolFee += _ceilDiv(ethAmount * _snipePremiumBps(c), BPS); // quote must match the buy premium
        uint256 ethIn = ethAmount - protocolFee - creatorFee;
        uint256 k = uint256(c.virtualEth) * c.virtualToken;
        tokensOut = uint256(c.virtualToken) - _ceilDiv(k, uint256(c.virtualEth) + ethIn);
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        if (tokensOut > remaining) tokensOut = remaining;
    }

    /// @notice Quote a sell: ETH out for `tokenAmount` (fees included).
    function quoteSell(address token, uint256 tokenAmount) external view returns (uint256 ethOut) {
        Curve storage c = curves[token];
        if (c.creator == address(0)) revert UnknownToken();
        uint256 k = uint256(c.virtualEth) * c.virtualToken;
        uint256 grossEth = uint256(c.virtualEth) - _ceilDiv(k, uint256(c.virtualToken) + tokenAmount);
        (uint256 protocolFee, uint256 creatorFee) = _splitFee(grossEth, c.protocolFeeBps, c.creatorFeeBps);
        ethOut = grossEth - protocolFee - creatorFee;
    }

    // ---------------------------------------------------------------- admin

    function setConfig(
        address feeRecipient_,
        address dexRouter_,
        uint16 protocolFeeBps_,
        uint16 creatorFeeBps_,
        uint96 creationFee_,
        uint128 initialVirtualEth_,
        uint128 migrationFee_,
        uint16 snipeStartBps_,
        uint32 snipeWindow_
    ) external onlyOwner {
        if (uint256(protocolFeeBps_) + creatorFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (uint256(snipeStartBps_) + protocolFeeBps_ + creatorFeeBps_ > BPS) revert SnipeFeeTooHigh();
        if (dexRouter_ == address(0)) revert RouterRequired();
        feeRecipient = feeRecipient_;
        dexRouter = dexRouter_;
        protocolFeeBps = protocolFeeBps_;
        creatorFeeBps = creatorFeeBps_;
        creationFee = creationFee_;
        initialVirtualEth = initialVirtualEth_;
        migrationFee = migrationFee_;
        snipeStartBps = snipeStartBps_;
        snipeWindow = snipeWindow_;
        emit ConfigUpdated(feeRecipient_, dexRouter_, protocolFeeBps_, creatorFeeBps_, creationFee_, initialVirtualEth_, migrationFee_, snipeStartBps_, snipeWindow_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ------------------------------------------------------------ internals

    function _activeCurve(address token) internal view returns (Curve storage c) {
        c = curves[token];
        if (c.creator == address(0)) revert UnknownToken();
        if (c.graduated) revert AlreadyGraduated();
    }

    function _sendEth(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    /// @dev Fee components ceil'd independently (trader-unfavourable rounding).
    function _splitFee(uint256 base, uint16 pBps, uint16 cBps)
        internal
        pure
        returns (uint256 protocolFee, uint256 creatorFee)
    {
        protocolFee = _ceilDiv(base * pBps, BPS);
        creatorFee = _ceilDiv(base * cBps, BPS);
    }

    /// @dev Anti-snipe premium (bps) for a buy on `c` right now: `snipeStartBps`
    ///      at launch, decaying linearly to 0 across `snipeWindow` seconds, then
    ///      zero forever. Charged on buys only and routed to the band. Snapshotted
    ///      per launch, so an owner config change never touches a live launch.
    function _snipePremiumBps(Curve storage c) internal view returns (uint256) {
        uint256 window = c.snipeWindow;
        if (window == 0 || c.snipeStartBps == 0) return 0;
        uint256 elapsed = block.timestamp - c.launchTime;
        if (elapsed >= window) return 0;
        return (uint256(c.snipeStartBps) * (window - elapsed)) / window;
    }

    /// @notice Anti-snipe buy premium (bps) at a launch's first second, decaying
    ///         linearly to 0 over `snipeWindow`. Charged on buys only, routed to
    ///         the band. Deliberately outside MAX_FEE_BPS (that caps the standing
    ///         fee; this is a launch-window anti-snipe mechanism). Appended here
    ///         (consuming a gap slot) to keep the storage layout upgrade-safe.
    uint16 public snipeStartBps;
    /// @notice Anti-snipe decay window (seconds) measured from token creation.
    uint32 public snipeWindow;

    /// @dev Reserved storage for future upgrades (one slot consumed by the
    ///      anti-snipe params above, which pack into a single slot).
    uint256[39] private __gap;
}
