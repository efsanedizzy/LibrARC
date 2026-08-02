export const launchFactoryAbi = [
  {
    type: "function",
    name: "createLaunch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name_", type: "string" },
      { name: "symbol_", type: "string" },
      { name: "metadataUri_", type: "string" }
    ],
    outputs: [
      { name: "launchToken", type: "address" },
      { name: "launchPool", type: "address" },
      { name: "launchId", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "quoteAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "buyFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "sellFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "graduationThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "virtualUsdcReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "virtualTokenReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "maxMetadataUriLength",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "launchCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "launchById",
    stateMutability: "view",
    inputs: [{ name: "launchId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "token", type: "address" },
          { name: "pool", type: "address" },
          { name: "metadataHash", type: "bytes32" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "poolByToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "tokenByPool",
    stateMutability: "view",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "isLibrarcToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "isLibrarcPool",
    stateMutability: "view",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "feeVault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "liquidityAdapter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "liquidityRecipient",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "event",
    name: "LaunchCreated",
    anonymous: false,
    inputs: [
      { name: "launchId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "launchToken", type: "address", indexed: true },
      { name: "launchPool", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "metadataUri", type: "string", indexed: false },
      { name: "metadataHash", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "error",
    name: "EmptyMetadataUri",
    inputs: []
  },
  {
    type: "error",
    name: "MetadataUriTooLong",
    inputs: [
      { name: "actualLength", type: "uint256" },
      { name: "maxLength", type: "uint256" }
    ]
  },
  {
    type: "error",
    name: "FactoryTokenBalanceNotZero",
    inputs: [{ name: "remainingBalance", type: "uint256" }]
  },
  {
    type: "error",
    name: "InvalidPoolInitialization",
    inputs: []
  },
  {
    type: "error",
    name: "TokenTransferFailed",
    inputs: []
  },
  {
    type: "error",
    name: "ZeroMaxMetadataUriLength",
    inputs: []
  },
  {
    type: "error",
    name: "NativeAssetNotAccepted",
    inputs: []
  },
  {
    type: "error",
    name: "EnforcedPause",
    inputs: []
  },
  {
    type: "error",
    name: "LibrARCTokenEmptyName",
    inputs: []
  },
  {
    type: "error",
    name: "LibrARCTokenEmptySymbol",
    inputs: []
  }
] as const;

export const launchPoolAbi = [
  {
    type: "function",
    name: "launchToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "quoteAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "feeVault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "canBuy",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "buyable", type: "bool" }]
  },
  {
    type: "function",
    name: "canSell",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "sellable", type: "bool" }]
  },
  {
    type: "function",
    name: "buysPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "allTradingPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "curveState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "state",
        type: "tuple",
        components: [
          { name: "realUsdcReserve", type: "uint256" },
          { name: "realTokenReserve", type: "uint256" },
          { name: "virtualUsdcReserve", type: "uint256" },
          { name: "virtualTokenReserve", type: "uint256" },
          { name: "accruedProtocolFees", type: "uint256" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "remainingGraduationCapacity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "capacity", type: "uint256" }]
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [{ name: "usdcAmountIn", type: "uint256" }],
    outputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "fee", type: "uint256" },
          { name: "netUsdcIn", type: "uint256" },
          { name: "tokenAmountOut", type: "uint256" },
          {
            name: "nextState",
            type: "tuple",
            components: [
              { name: "realUsdcReserve", type: "uint256" },
              { name: "realTokenReserve", type: "uint256" },
              { name: "virtualUsdcReserve", type: "uint256" },
              { name: "virtualTokenReserve", type: "uint256" },
              { name: "accruedProtocolFees", type: "uint256" }
            ]
          }
        ]
      },
      { name: "reachesGraduationThreshold", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "usdcAmountIn", type: "uint256" },
      { name: "minTokenAmountOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "recipient", type: "address" }
    ],
    outputs: [{ name: "tokenAmountOut", type: "uint256" }]
  },
  {
    type: "function",
    name: "quoteSell",
    stateMutability: "view",
    inputs: [{ name: "tokenAmountIn", type: "uint256" }],
    outputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "fee", type: "uint256" },
          { name: "grossUsdcAmountOut", type: "uint256" },
          { name: "netUsdcAmountOut", type: "uint256" },
          {
            name: "nextState",
            type: "tuple",
            components: [
              { name: "realUsdcReserve", type: "uint256" },
              { name: "realTokenReserve", type: "uint256" },
              { name: "virtualUsdcReserve", type: "uint256" },
              { name: "virtualTokenReserve", type: "uint256" },
              { name: "accruedProtocolFees", type: "uint256" }
            ]
          }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenAmountIn", type: "uint256" },
      { name: "minUsdcAmountOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "recipient", type: "address" }
    ],
    outputs: [{ name: "netUsdcAmountOut", type: "uint256" }]
  },
  {
    type: "error",
    name: "PoolNotActive",
    inputs: [{ name: "currentStatus", type: "uint8" }]
  },
  {
    type: "error",
    name: "GraduationThresholdExceeded",
    inputs: [
      { name: "currentRealUsdcReserve", type: "uint256" },
      { name: "netUsdcIn", type: "uint256" },
      { name: "graduationThreshold", type: "uint256" }
    ]
  },
  {
    type: "error",
    name: "BuysPaused",
    inputs: []
  },
  {
    type: "error",
    name: "AllTradingPaused",
    inputs: []
  },
  {
    type: "error",
    name: "ZeroRecipient",
    inputs: []
  },
  {
    type: "error",
    name: "ExpiredDeadline",
    inputs: [
      { name: "currentTimestamp", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  },
  {
    type: "error",
    name: "InsufficientTokenOutput",
    inputs: [
      { name: "minimumTokenAmountOut", type: "uint256" },
      { name: "actualTokenAmountOut", type: "uint256" }
    ]
  },
  {
    type: "error",
    name: "InsufficientUsdcOutput",
    inputs: [
      { name: "minimumUsdcAmountOut", type: "uint256" },
      { name: "actualUsdcAmountOut", type: "uint256" }
    ]
  },
  {
    type: "error",
    name: "ZeroInput",
    inputs: []
  },
  {
    type: "error",
    name: "ZeroOutput",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidFeeBps",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientRealTokenReserve",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientRealUsdcReserve",
    inputs: []
  },
  {
    type: "error",
    name: "TokenReserveExceedsTotalSupply",
    inputs: []
  }
] as const;

export const librarcTokenAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "event",
    name: "Approval",
    anonymous: false,
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false }
    ]
  },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" }
    ]
  },
  {
    type: "error",
    name: "ERC20InvalidApprover",
    inputs: [{ name: "approver", type: "address" }]
  },
  {
    type: "error",
    name: "ERC20InvalidSpender",
    inputs: [{ name: "spender", type: "address" }]
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" }
    ]
  }
] as const;

export const feeVaultAbi = [
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;
