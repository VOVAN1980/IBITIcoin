// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ✅ контракт 1: BridgeManagerStub
contract BridgeManagerStub {
    uint256 public mintCount;

    function isTrustedBridge(address) external pure returns (bool) {
        return true;
    }

    function checkAndUpdateBridgeMint(uint256) external {
        mintCount += 1;
        if (mintCount > 1) {
            revert("BridgeMintLimitExceeded");
        }
    }

    function checkAndUpdateBridgeBurn(uint256) external pure {
        // всегда разрешаем burn
    }
}

// ✅ контракт 2: FeeManagerStub
contract FeeManagerStub {
    function calculateFee(
        address, uint256 amt,
        bool, bool, bool, bool, uint256, uint256
    ) external pure returns (uint256) {
        return (amt * 10) / 100;
    }

    function updateActivity(address, uint256, bool) external pure {}
}
