# Arc TaskFlow MVP

Static frontend + Solidity escrow contract for an Arc-native agent marketplace demo.

## What this includes

- `index.html`: dashboard UI for Arc Testnet
- `styles.css`: presentation-ready visual layer
- `app.js`: wallet connection and contract interaction logic
- `../contracts/ArcAgentEscrowMarketplace.sol`: USDC escrow smart contract

## Product flow

1. Client creates a job with `agent`, `evaluator`, `budget`, `deadline`, and `metadataURI`
2. Client approves USDC spending for the escrow contract
3. Client funds escrow
4. Agent submits a deliverable hash or URI hash
5. Evaluator approves or rejects
6. If deadline passes without resolution, client claims refund

## Arc defaults

- Arc Testnet chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Testnet USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`

## How to use

### 1. Deploy the contract

Deploy [`ArcAgentEscrowMarketplace.sol`](../contracts/ArcAgentEscrowMarketplace.sol) on Arc Testnet with the constructor argument:

```text
0x3600000000000000000000000000000000000000
```

That is the Arc Testnet USDC interface address from Arc docs.

### 2. Serve the frontend

This is a static app. You can open it with a local server, for example:

```text
npx serve .
```

Or any equivalent static web server.

### 3. Configure the UI

- Connect wallet
- Switch to Arc Testnet
- Paste deployed escrow contract address
- Save config
- Use the create / approve / fund / submit / approve / reject / refund flows

## Demo script idea

1. Connect MetaMask and switch to Arc Testnet
2. Show USDC gas and faucet links
3. Create a job for an AI agent
4. Approve USDC and fund escrow
5. Submit a deliverable hash as the agent
6. Approve settlement as evaluator
7. Refresh jobs and show final paid state

## Important notes

- Arc uses USDC for gas, but the ERC-20 interface still uses token decimals when transferring budget values
- The frontend assumes 6-decimal USDC amounts
- The app is intentionally static and dependency-light so you can demo it quickly
- For production, move reads to an indexer and add wallet-role aware routing, auth, and persistence
