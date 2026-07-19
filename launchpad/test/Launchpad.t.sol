// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

import {Launchpad} from "../src/Launchpad.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

// ----------------------------------------------------------- LittleJohn mocks

contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped ETH", "WETH") {}
    function deposit() external payable { _mint(msg.sender, msg.value); }
}

contract MockPair is ERC20 {
    constructor() ERC20("LittleJohn-LP", "LJ-LP") {}
    function mint(address to) external returns (uint256 liq) { liq = 1e18; _mint(to, liq); }
}

contract MockFactory {
    mapping(bytes32 => address) internal _pairs;

    function _key(address a, address b, bool s) internal pure returns (bytes32) {
        (address t0, address t1) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encode(t0, t1, s));
    }
    function getPair(address a, address b, bool s) public view returns (address) { return _pairs[_key(a, b, s)]; }
    function createPair(address a, address b, bool s) public returns (address p) {
        p = getPair(a, b, s);
        if (p == address(0)) { p = address(new MockPair()); _pairs[_key(a, b, s)] = p; }
    }
}

/// @dev Mirrors LittleJohn's Router graduation path (stable bool + fresh-pair add).
contract MockRouter {
    address public factory;
    address public weth;
    constructor(address f, address w) { factory = f; weth = w; }

    function addLiquidityETH(address token, bool stable, uint256 amountTokenDesired, uint256, uint256, address to, uint256)
        external
        payable
        returns (uint256, uint256, uint256)
    {
        address pair = MockFactory(factory).getPair(token, weth, stable);
        if (pair == address(0)) pair = MockFactory(factory).createPair(token, weth, stable);
        IERC20(token).transferFrom(msg.sender, pair, amountTokenDesired);
        MockWETH(weth).deposit{value: msg.value}();
        IERC20(weth).transfer(pair, msg.value);
        uint256 liq = MockPair(pair).mint(to);
        return (amountTokenDesired, msg.value, liq);
    }
}

// ------------------------------------------------------------------- fixture

abstract contract Fixture is Test {
    Launchpad pad;
    MockWETH weth;
    MockFactory factory;
    MockRouter router;

    address owner = address(this);
    address feeRecipient = makeAddr("feeRecipient");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");

    uint16 constant P_FEE = 100; // 1%
    uint16 constant C_FEE = 30; // 0.3%
    uint128 constant INIT_V_ETH = 1 ether;
    uint128 constant MIG_FEE = 0.1 ether;

    function _deploy() internal {
        weth = new MockWETH();
        factory = new MockFactory();
        router = new MockRouter(address(factory), address(weth));

        address tokenImpl = address(new LaunchToken());
        address beacon = address(new UpgradeableBeacon(tokenImpl, owner));
        address padImpl = address(new Launchpad());
        bytes memory init = abi.encodeCall(
            Launchpad.initialize,
            (owner, beacon, feeRecipient, address(router), P_FEE, C_FEE, uint96(0), INIT_V_ETH, MIG_FEE, uint16(0), uint32(0))
        );
        pad = Launchpad(payable(new ERC1967Proxy(padImpl, init)));
    }

    function _create() internal returns (address token) {
        vm.prank(creator);
        token = pad.createToken("Meme", "MEME", "ipfs://x");
    }
}

// --------------------------------------------------------------- unit tests

contract LaunchpadTest is Fixture {
    function setUp() public { _deploy(); }

    function test_CreateToken() public {
        address token = _create();
        assertEq(pad.tokenCount(), 1);
        Launchpad.Curve memory c = pad.getCurve(token);
        assertEq(c.creator, creator);
        assertEq(uint256(c.virtualEth), INIT_V_ETH);
        assertEq(uint256(c.tokensSold), 0);
        assertEq(uint256(c.protocolFeeBps), P_FEE);
        assertFalse(c.graduated);
    }

    function test_BuyThenSellRoundTrips() public {
        address token = _create();
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        uint256 got = pad.buy{value: 1 ether}(token, 0);
        assertGt(got, 0);
        assertEq(IERC20(token).balanceOf(alice), got);

        uint256 balBefore = alice.balance;
        vm.startPrank(alice);
        IERC20(token).approve(address(pad), got);
        uint256 ethOut = pad.sell(token, got, 0);
        vm.stopPrank();

        assertEq(alice.balance, balBefore + ethOut);
        // fees on both legs => less ETH back than the 1 ether put in.
        assertLt(ethOut, 1 ether);
        // curve returns to ~empty after a full round trip.
        assertEq(uint256(pad.getCurve(token).tokensSold), 0);
    }

    function test_QuoteBuyMatches() public {
        address token = _create();
        uint256 quoted = pad.quoteBuy(token, 1 ether);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 got = pad.buy{value: 1 ether}(token, 0);
        assertEq(got, quoted);
    }

    // ------------------------------------------------------- anti-snipe fee

    // +79% buy premium at t0 (total ~80% with the 1% base), decaying over 120s.
    function _enableSnipe() internal {
        pad.setConfig(feeRecipient, address(router), P_FEE, C_FEE, uint96(0), INIT_V_ETH, MIG_FEE, uint16(7900), uint32(120));
    }

    function test_AntiSnipe_EarlyBuyTaxedToBand() public {
        _enableSnipe();
        address token = _create();
        vm.deal(alice, 1 ether);
        uint256 frBefore = feeRecipient.balance;
        vm.prank(alice);
        uint256 got = pad.buy{value: 1 ether}(token, 0);
        // ~80% of the buy goes to the band (1% base protocol + 79% premium).
        assertApproxEqAbs(feeRecipient.balance - frBefore, 0.8 ether, 1e12);
        assertGt(got, 0);
    }

    function test_AntiSnipe_DecaysAndPatientBuyerWins() public {
        _enableSnipe();
        // Sniper buys at t0 on a fresh token.
        address early = _create();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 gotEarly = pad.buy{value: 1 ether}(early, 0);

        // Patient buyer waits out the window on a fresh token.
        address late = _create();
        vm.warp(block.timestamp + 121);
        vm.deal(alice, 1 ether);
        uint256 frBefore = feeRecipient.balance;
        vm.prank(alice);
        uint256 gotLate = pad.buy{value: 1 ether}(late, 0);
        // Only the 1% base protocol fee now — no premium.
        assertApproxEqAbs(feeRecipient.balance - frBefore, 0.01 ether, 1e12);
        // Same ETH, far more tokens than the sniper got.
        assertGt(gotLate, gotEarly * 3);
    }

    function test_AntiSnipe_SellsNeverCarryPremium() public {
        _enableSnipe();
        address token = _create();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 got = pad.buy{value: 1 ether}(token, 0); // taxed in-window buy
        // Sell immediately, still inside the window: base fee only, no premium.
        uint256 frBefore = feeRecipient.balance;
        vm.startPrank(alice);
        IERC20(token).approve(address(pad), got);
        uint256 ethOut = pad.sell(token, got, 0);
        vm.stopPrank();
        assertLt(feeRecipient.balance - frBefore, 0.005 ether);
        assertGt(ethOut, 0);
    }

    function test_AntiSnipe_QuoteMatchesInWindow() public {
        _enableSnipe();
        address token = _create();
        vm.warp(block.timestamp + 60); // mid-decay
        uint256 quoted = pad.quoteBuy(token, 1 ether);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 got = pad.buy{value: 1 ether}(token, 0);
        assertEq(got, quoted);
    }

    function test_CreatorFeesAccrueAndClaim() public {
        address token = _create();
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        uint256 fees = pad.creatorFees(creator);
        assertGt(fees, 0);

        uint256 balBefore = creator.balance;
        vm.prank(creator);
        pad.claimCreatorFees();
        assertEq(creator.balance, balBefore + fees);
        assertEq(pad.creatorFees(creator), 0);
    }

    function test_FeesSnapshottedPerCurve() public {
        address token = _create();
        // Owner cranks the default fees after the curve is live.
        pad.setConfig(feeRecipient, address(router), 400, 100, uint96(0), INIT_V_ETH, MIG_FEE, uint16(0), uint32(0));
        // The live curve keeps its original economics.
        Launchpad.Curve memory c = pad.getCurve(token);
        assertEq(uint256(c.protocolFeeBps), P_FEE);
        assertEq(uint256(c.creatorFeeBps), C_FEE);
    }

    function test_GraduationMigratesToDex() public {
        address token = _create();
        vm.deal(alice, 200 ether);

        uint256 frBefore = feeRecipient.balance;
        vm.prank(alice);
        pad.buy{value: 100 ether}(token, 0); // overshoots -> graduates + migrates atomically

        Launchpad.Curve memory c = pad.getCurve(token);
        assertTrue(c.graduated);
        assertEq(uint256(c.realEth), 0); // drained into the pool
        assertTrue(LaunchToken(token).graduated());

        address pair = factory.getPair(token, address(weth), false);
        assertTrue(pair != address(0));
        assertEq(MockPair(pair).balanceOf(pad.DEAD()), 1e18); // LP locked to dead
        assertEq(IERC20(token).balanceOf(pair), pad.LP_SUPPLY()); // reserved tranche seeded
        // feeRecipient gets the migration fee plus the protocol fee on the
        // graduating buy; protocol fee alone is < MIG_FEE, so >= proves the
        // migration fee flowed.
        assertGe(feeRecipient.balance, frBefore + MIG_FEE);
    }

    function test_RevertsBuyingAfterGraduation() public {
        address token = _create();
        vm.deal(alice, 200 ether);
        vm.prank(alice);
        pad.buy{value: 100 ether}(token, 0);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(Launchpad.AlreadyGraduated.selector);
        pad.buy{value: 1 ether}(token, 0);
    }

    function test_RevertsWithoutRouter() public {
        address padImpl = address(new Launchpad());
        bytes memory init = abi.encodeCall(
            Launchpad.initialize,
            (owner, address(0xBEEF), feeRecipient, address(0), P_FEE, C_FEE, uint96(0), INIT_V_ETH, MIG_FEE, uint16(0), uint32(0))
        );
        vm.expectRevert(Launchpad.RouterRequired.selector);
        new ERC1967Proxy(padImpl, init);
    }
}

// ----------------------------------------------------- solvency invariant

contract CurveHandler is Test {
    Launchpad pad;
    address token;

    constructor(Launchpad _pad, address _token) { pad = _pad; token = _token; }
    receive() external payable {}

    function buy(uint256 ethAmt) public {
        ethAmt = bound(ethAmt, 1e12, 3 ether);
        if (address(this).balance < ethAmt) return;
        try pad.buy{value: ethAmt}(token, 0) {} catch {}
    }

    function sell(uint256 amt) public {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        IERC20(token).approve(address(pad), amt);
        try pad.sell(token, amt, 0) {} catch {}
    }
}

contract SolvencyInvariant is Fixture {
    CurveHandler handler;
    address token;

    function setUp() public {
        _deploy();
        token = _create();
        handler = new CurveHandler(pad, token);
        vm.deal(address(handler), 1000 ether);

        bytes4[] memory sels = new bytes4[](2);
        sels[0] = CurveHandler.buy.selector;
        sels[1] = CurveHandler.sell.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
        targetContract(address(handler));
    }

    /// @dev The launchpad must always hold at least the ETH it owes: the
    ///      active curve's reserve plus every unclaimed creator fee. Fees paid
    ///      out and post-graduation drains keep the inequality slack, never
    ///      break it.
    function invariant_curveStaysSolvent() public view {
        Launchpad.Curve memory c = pad.getCurve(token);
        assertGe(address(pad).balance, uint256(c.realEth) + pad.creatorFees(creator));
    }
}
