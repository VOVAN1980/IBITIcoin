
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RevertingReceiver {
    receive() external payable {
        revert("Refund failed intentionally");
    }

    function buyAndFailRefund(address ibi) external payable {
        (bool ok, ) = ibi.call{value: msg.value}(
            abi.encodeWithSignature("purchaseCoinBNB()")
        );
        require(!ok);
    }
}
