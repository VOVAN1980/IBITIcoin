// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title IBITIcoin V2
 * @notice Обычный BEP-20 с фиксированным выпуском.
 *         Весь выпуск создаётся один раз в конструкторе и сразу распределяется по адресам.
 *
 *         Сознательно НЕТ: владельца, выпуска новых токенов, паузы, чёрного списка,
 *         комиссий, покупки/продажи внутри токена, моста, прокси/апгрейда,
 *         переводов чужих токенов без approve.
 *         Сжечь можно только свои токены (или чужие — в пределах выданного approve).
 */
contract IBITI is ERC20, ERC20Burnable {
    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 10 ** 8;

    error EmptyDistribution();
    error LengthMismatch();
    error ZeroRecipient(uint256 index);
    error ZeroAmount(uint256 index);
    error SupplyMismatch(uint256 distributed);

    constructor(address[] memory recipients, uint256[] memory amounts) ERC20("IBITIcoin", "IBITI") {
        if (recipients.length == 0) revert EmptyDistribution();
        if (recipients.length != amounts.length) revert LengthMismatch();

        uint256 distributed;
        for (uint256 i; i < recipients.length; ++i) {
            if (recipients[i] == address(0)) revert ZeroRecipient(i);
            if (amounts[i] == 0) revert ZeroAmount(i);
            _mint(recipients[i], amounts[i]);
            distributed += amounts[i];
        }
        if (distributed != TOTAL_SUPPLY) revert SupplyMismatch(distributed);
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }
}
