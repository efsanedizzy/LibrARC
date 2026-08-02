import assert from "node:assert/strict";
import test from "node:test";

import { encodeAbiParameters, encodeEventTopics, getAddress } from "viem";

import { launchFactoryAbi } from "./abis";
import {
  buildArcScanAddressUrl,
  buildArcScanTransactionUrl,
  buildLaunchMetadata,
  buildLaunchTokenPagePath,
  createCompactLaunchMetadata,
  decodeLaunchCreatedEventFromReceipt,
  exceedsLaunchMetadataLimit,
  getUtf8ByteLength,
  parseLaunchMetadataUri
} from "./launch-metadata";

test("metadata generation is deterministic and omits empty optional fields", () => {
  const metadata = buildLaunchMetadata({
    name: "Arc Nova",
    symbol: "ARCN",
    description: ""
  });

  assert.equal(metadata.json, JSON.stringify({ name: "Arc Nova", symbol: "ARCN" }));
  assert.deepEqual(
    createCompactLaunchMetadata({
      name: "Arc Nova",
      symbol: "ARCN",
      description: ""
    }),
    {
      name: "Arc Nova",
      symbol: "ARCN"
    }
  );
});

test("utf-8 byte counting uses the encoded metadata uri length", () => {
  const value = "Arc €";

  assert.equal(getUtf8ByteLength(value), 7);
});

test("metadata limit rejection compares actual bytes to the contract limit", () => {
  const metadata = buildLaunchMetadata({
    name: "Arc Nova",
    symbol: "ARCN",
    description: "Compact metadata"
  });

  assert.equal(
    exceedsLaunchMetadataLimit(metadata.uriByteLength, metadata.uriByteLength - 1),
    true
  );
  assert.equal(exceedsLaunchMetadataLimit(metadata.uriByteLength, metadata.uriByteLength), false);
});

test("decodes the exact LaunchCreated event from a wallet receipt", () => {
  const factoryAddress = getAddress("0xc94503F5DcDc43B0a4693C689a7520ccfd2bA0fA");
  const creator = getAddress("0x1111111111111111111111111111111111111111");
  const launchToken = getAddress("0x2222222222222222222222222222222222222222");
  const launchPool = getAddress("0x3333333333333333333333333333333333333333");
  const metadataUri = "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D";
  const metadataHash =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const topics = encodeEventTopics({
    abi: launchFactoryAbi,
    eventName: "LaunchCreated",
    args: {
      creator,
      launchId: 7n,
      launchToken
    }
  }).flatMap((topic): string[] => {
    if (typeof topic === "string") {
      return [topic];
    }

    throw new Error("The LaunchCreated fixture expected only flat indexed topics.");
  });
  const log = {
    address: factoryAddress,
    data: encodeAbiParameters(
      [
        { name: "launchPool", type: "address" },
        { name: "name", type: "string" },
        { name: "symbol", type: "string" },
        { name: "metadataUri", type: "string" },
        { name: "metadataHash", type: "bytes32" }
      ],
      [launchPool, "Arc Nova", "ARCN", metadataUri, metadataHash]
    ),
    topics
  };

  const decoded = decodeLaunchCreatedEventFromReceipt(
    {
      logs: [log]
    },
    factoryAddress
  );

  assert.equal(decoded.launchId, "7");
  assert.equal(decoded.creator, creator);
  assert.equal(decoded.launchToken, launchToken);
  assert.equal(decoded.launchPool, launchPool);
  assert.equal(decoded.name, "Arc Nova");
  assert.equal(decoded.symbol, "ARCN");
  assert.equal(decoded.metadataHash, metadataHash);
});

test("builds token page and ArcScan links", () => {
  const token = getAddress("0x2222222222222222222222222222222222222222");
  const txHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

  assert.equal(buildLaunchTokenPagePath(token), `/token/${token}`);
  assert.equal(
    buildArcScanAddressUrl("https://testnet.arcscan.app", token),
    `https://testnet.arcscan.app/address/${token}`
  );
  assert.equal(
    buildArcScanTransactionUrl("https://testnet.arcscan.app", txHash),
    `https://testnet.arcscan.app/tx/${txHash}`
  );
});

test("malformed metadata uri payloads are handled safely", () => {
  const parsed = parseLaunchMetadataUri("data:application/json,%7Bnot-json%7D");

  assert.equal(parsed.description, undefined);
  assert.equal(
    parsed.warning?.message,
    "The metadata URI could not be decoded as trusted JSON display text."
  );
});
