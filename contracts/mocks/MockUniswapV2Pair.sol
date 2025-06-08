// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../IUniswapV2Pair.sol";

contract MockUniswapV2Pair is IUniswapV2Pair {
    uint112 private _reserve0;
    uint112 private _reserve1;
    
    constructor(uint112 reserve0_, uint112 reserve1_) {
        _reserve0 = reserve0_;
        _reserve1 = reserve1_;
    }
    
    // Reads stored reserves ⇒ view
    function getReserves() external view override returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, 0);
    }
    
    // Constant stubs ⇒ pure
    function factory() external pure override returns (address) {
        return address(0);
    }
    
    function kLast() external pure override returns (uint) {
        return 0;
    }
    
    function swap(
        uint /*amount0Out*/,
        uint /*amount1Out*/,
        address /*to*/,
        bytes calldata /*data*/
    ) external override {
        // Заглушка.
    }
    
    function token0() external pure override returns (address) {
        return address(0);
    }
    
    function token1() external pure override returns (address) {
        return address(0);
    }
    
    function DOMAIN_SEPARATOR() external pure override returns (bytes32) {
        return bytes32(0);
    }
    
    function MINIMUM_LIQUIDITY() external pure override returns (uint) {
        return 0;
    }
    
    function PERMIT_TYPEHASH() external pure override returns (bytes32) {
        return bytes32(0);
    }
    
    function allowance(address /*owner*/, address /*spender*/) external pure override returns (uint) {
        return 0;
    }
    
    function approve(address /*spender*/, uint /*value*/) external pure override returns (bool) {
        return true;
    }
    
    function balanceOf(address /*owner*/) external pure override returns (uint) {
        return 0;
    }
    
    function burn(address /*to*/) external pure override returns (uint amount0, uint amount1) {
        return (0, 0);
    }
    
    function decimals() external pure override returns (uint8) {
        return 18;
    }
    
    function initialize(address /*token0*/, address /*token1*/) external override {
        // Заглушка.
    }
    
    function mint(address /*to*/) external pure override returns (uint liquidity) {
        return 0;
    }
    
    function name() external pure override returns (string memory) {
        return "MockUniswapV2Pair";
    }
    
    function nonces(address /*owner*/) external pure override returns (uint) {
        return 0;
    }
    
    function permit(
        address /*owner*/,
        address /*spender*/,
        uint /*value*/,
        uint /*deadline*/,
        uint8 /*v*/,
        bytes32 /*r*/,
        bytes32 /*s*/
    ) external override {
        // Заглушка.
    }
    
    function price0CumulativeLast() external pure override returns (uint) {
        return 0;
    }
    
    function price1CumulativeLast() external pure override returns (uint) {
        return 0;
    }
    
    function symbol() external pure override returns (string memory) {
        return "MUP";
    }
    
    function totalSupply() external pure override returns (uint) {
        return 0;
    }
    
    function transfer(address /*to*/, uint /*value*/) external pure override returns (bool) {
        return true;
    }
    
    function transferFrom(address /*from*/, address /*to*/, uint /*value*/) external pure override returns (bool) {
        return true;
    }
    
    function sync() external override {
        // Заглушка.
    }
    
    function skim(address /*to*/) external override {
        // Заглушка.
    }
}
