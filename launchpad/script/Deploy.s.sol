// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

/// @notice Deploys the LittleJohn launchpad: LaunchToken beacon + UUPS Launchpad
///         proxy, pointed at the already-deployed LittleJohn Router for
///         graduation. Owner should be the governance multisig.
///
/// Required env:
///   OWNER            governance multisig (owns beacon + launchpad, upgrade key)
///   FEE_RECIPIENT    protocol/creation/migration fee sink (treasury)
///   LJ_ROUTER        deployed LittleJohn Router address (graduation venue)
/// Optional env (sane defaults for a pump.fun-style launch):
///   PROTOCOL_FEE_BPS (default 95), CREATOR_FEE_BPS (default 30),
///   CREATION_FEE_WEI (default 0), INITIAL_VIRTUAL_ETH_WEI, MIGRATION_FEE_WEI
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address ljRouter = vm.envAddress("LJ_ROUTER");
        // Locked fair-launch params (see plans/fair-launch-spec.md, 2026-07-16):
        // 1% trade fee split 60/40 protocol/creator; free creation; graduation at
        // pump.fun parity (~$65k mcap, ~3.83 ETH raised); zero migration fee for
        // maximum seed-LP depth. No dev first-buy cap (pump.fun-style).
        uint16 protocolFeeBps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(60)));
        uint16 creatorFeeBps = uint16(vm.envOr("CREATOR_FEE_BPS", uint256(40)));
        uint96 creationFee = uint96(vm.envOr("CREATION_FEE_WEI", uint256(0)));
        uint128 initialVirtualEth = uint128(vm.envOr("INITIAL_VIRTUAL_ETH_WEI", uint256(1.35 ether)));
        uint128 migrationFee = uint128(vm.envOr("MIGRATION_FEE_WEI", uint256(0)));

        vm.startBroadcast();

        address tokenImpl = address(new LaunchToken());
        address beacon = address(new UpgradeableBeacon(tokenImpl, owner));
        address padImpl = address(new Launchpad());
        bytes memory init = abi.encodeCall(
            Launchpad.initialize,
            (owner, beacon, feeRecipient, ljRouter, protocolFeeBps, creatorFeeBps, creationFee, initialVirtualEth, migrationFee)
        );
        address pad = address(new ERC1967Proxy(padImpl, init));

        vm.stopBroadcast();

        console2.log("LaunchToken impl:", tokenImpl);
        console2.log("Token beacon:    ", beacon);
        console2.log("Launchpad impl:  ", padImpl);
        console2.log("Launchpad proxy: ", pad);
    }
}
