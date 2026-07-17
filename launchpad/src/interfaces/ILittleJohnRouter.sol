// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal view of LittleJohn's Velodrome-style Router (solc 0.8.13,
///         deployed separately), only the pieces graduation needs. The extra
///         `stable` bool and the ETH-dust refund to `msg.sender` are the two
///         differences from a vanilla UniswapV2 router.
interface ILittleJohnRouter {
    function factory() external view returns (address);
    function weth() external view returns (address);

    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

interface ILittleJohnPairFactory {
    function getPair(address tokenA, address tokenB, bool stable) external view returns (address);
    function createPair(address tokenA, address tokenB, bool stable) external returns (address);
}
