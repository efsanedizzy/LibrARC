// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LibrARCToken
/// @notice Fixed-supply ERC-20 token used by the LibrARC launch protocol MVP.
contract LibrARCToken is ERC20 {
    /// @notice Reverts when the initial token holder is the zero address.
    error LibrARCTokenInvalidInitialHolder();

    /// @notice Reverts when the token name is empty.
    error LibrARCTokenEmptyName();

    /// @notice Reverts when the token symbol is empty.
    error LibrARCTokenEmptySymbol();

    /// @notice The immutable fixed total supply minted once during construction.
    uint256 public constant FIXED_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Creates a fixed-supply LibrARC token and mints the entire supply to `initialHolder_`.
    /// @param name_ The ERC-20 token name.
    /// @param symbol_ The ERC-20 token symbol.
    /// @param initialHolder_ The address that receives the full fixed supply.
    constructor(string memory name_, string memory symbol_, address initialHolder_)
        ERC20(name_, symbol_)
    {
        if (bytes(name_).length == 0) revert LibrARCTokenEmptyName();
        if (bytes(symbol_).length == 0) revert LibrARCTokenEmptySymbol();
        if (initialHolder_ == address(0)) revert LibrARCTokenInvalidInitialHolder();

        _mint(initialHolder_, FIXED_SUPPLY);
    }
}
