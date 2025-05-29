// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DummyUserStatus {
  // Никто не бот, не VIP, не кит
  function isFlaggedBot(address) external pure returns (bool) { return false; }
  function isVIPUser(address) external pure returns (bool)    { return false; }
  function isWhale(address) external pure returns (bool)      { return false; }
}
