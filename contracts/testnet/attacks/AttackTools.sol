// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @notice Только для тестов атак. Контракт-злоумышленник: вызывает что угодно от своего имени.
contract AttackerBot is IERC721Receiver {
    uint256 public received;
    address public hookTarget;
    bytes public hookPayload;
    bool public hookSucceeded;

    receive() external payable {}

    function exec(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call{value: msg.value}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }

    function setHook(address target, bytes calldata payload) external {
        hookTarget = target;
        hookPayload = payload;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        received += 1;
        if (hookTarget != address(0)) {
            (bool ok, ) = hookTarget.call(hookPayload);
            hookSucceeded = ok;
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @notice Только для тестов атак. Токен, который при переводе пытается вернуться в атакуемый контракт.
contract HostileToken is ERC20 {
    uint8 private immutable _dec;
    address public target;
    bytes public payload;
    uint256 public attempts;
    uint256 public successes;
    bool private _busy;

    constructor(uint8 dec_) ERC20("Hostile", "HST") {
        _dec = dec_;
        _mint(msg.sender, 1e30);
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        attempts = 0;
        successes = 0;
    }

    function _afterTokenTransfer(address, address, uint256) internal override {
        if (target == address(0) || _busy) return;
        _busy = true;
        attempts += 1;
        (bool ok, ) = target.call(payload);
        if (ok) successes += 1;
        _busy = false;
    }
}
