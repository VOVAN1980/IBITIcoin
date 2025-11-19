// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Mintable {
    function mint(address to, uint256 amount) external;
}

contract MockRouter {
    address public tokenOut;
    uint256 public multiplier;

    constructor(address _tokenOut, uint256 _multiplier) {
        tokenOut = _tokenOut;
        multiplier = _multiplier;
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256,
        address[] calldata,
        address to,
        uint256
    ) external {
        IERC20Mintable(tokenOut).mint(to, amountIn * multiplier);
    }
}

