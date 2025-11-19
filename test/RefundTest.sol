// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RefundTest {
    bool public revertOnReceive;
    event RefundSuccess();

    /// @notice Включает/выключает принудительный revert при получении ETH
    function setRevertOnReceive(bool v) external {
        revertOnReceive = v;
    }

    /// @notice Тестовый метод: посылает обратно весь полученный эфир
    function testRefund() external payable returns (bool) {
        (bool ok,) = payable(msg.sender).call{value: msg.value}("");
        if (!ok) revert();
        if (revertOnReceive) revert();
        emit RefundSuccess();
        return true;
    }

    /// @notice receive-функция, которая может revert’ить
    receive() external payable {
        if (revertOnReceive) revert();
    }
}
