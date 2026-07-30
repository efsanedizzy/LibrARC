// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";

import { ArcTestnetStagingAdapter } from "../src/adapters/ArcTestnetStagingAdapter.sol";

/// @notice Deployment script for the Arc Testnet-only staging adapter.
contract DeployArcTestnetStagingAdapter is Script {
    error WrongChain(uint256 actualChainId);
    error ZeroRecipient();
    error DeploymentValidationFailed(string checkName);

    uint256 public constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    function run() external returns (address adapterAddress) {
        _requireArcTestnetChain();

        address stagingRecipient = vm.envOr("ARC_LIQUIDITY_RECIPIENT", address(0));
        if (stagingRecipient == address(0)) revert ZeroRecipient();

        vm.startBroadcast();
        ArcTestnetStagingAdapter adapter = new ArcTestnetStagingAdapter(stagingRecipient);
        vm.stopBroadcast();

        adapterAddress = address(adapter);
        _validateDeployment(adapterAddress, stagingRecipient);

        console2.log("ARC TESTNET ONLY - NOT A DEX LIQUIDITY ADAPTER");
        console2.log("stagingAdapter");
        console2.logAddress(adapterAddress);
    }

    function _requireArcTestnetChain() internal view {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
    }

    function _validateDeployment(address adapterAddress, address stagingRecipient) internal view {
        if (adapterAddress.code.length == 0) {
            revert DeploymentValidationFailed("adapter bytecode");
        }
        if (
            ArcTestnetStagingAdapter(payable(adapterAddress)).stagingRecipient() != stagingRecipient
        ) {
            revert DeploymentValidationFailed("staging recipient");
        }
    }
}
