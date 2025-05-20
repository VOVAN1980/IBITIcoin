// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockDAO {
  function createProposalSimple(string calldata) external pure returns(bool) {
    return true;
  }

  function voteProposal(uint256, bool) external pure returns(bool) {
    return true;
  }

  function executeProposalSimple(uint256) external pure returns(bool) {
    return true;
  }
}
