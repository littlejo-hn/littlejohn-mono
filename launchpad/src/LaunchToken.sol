// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/// @title LaunchToken
/// @notice The ERC20 minted for every launch on the LittleJohn launchpad.
///         Deployed as a BeaconProxy per launch, so a single beacon upgrade
///         reaches every token at once.
///
///         The whole supply is minted to the launchpad at init. Until the token
///         graduates, transfers must touch the launchpad on one side, this
///         keeps anyone from standing up a rogue side-pool while the bonding
///         curve is still the only venue.
contract LaunchToken is Initializable, ERC20Upgradeable {
    /// @notice The launchpad that deployed and controls this token pre-graduation.
    address public launchpad;
    /// @notice Flips true when the curve completes; unlocks free transfers.
    bool public graduated;
    /// @notice Off-chain metadata (image, description, socials), usually IPFS.
    string public metadataURI;

    error NotLaunchpad();
    error TransferLockedUntilGraduation();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI_,
        uint256 supply_,
        address launchpad_
    ) external initializer {
        __ERC20_init(name_, symbol_);
        launchpad = launchpad_;
        metadataURI = metadataURI_;
        _mint(launchpad_, supply_);
    }

    /// @notice Called once by the launchpad when the curve completes.
    function markGraduated() external {
        if (msg.sender != launchpad) revert NotLaunchpad();
        graduated = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        // Mints (from == 0) always pass; pre-graduation, every transfer must
        // have the launchpad on one side (curve buys/sells + the graduation
        // liquidity add).
        if (!graduated && from != address(0) && from != launchpad && to != launchpad) {
            revert TransferLockedUntilGraduation();
        }
        super._update(from, to, value);
    }

    /// @dev Reserved storage for future beacon upgrades.
    uint256[47] private __gap;
}
