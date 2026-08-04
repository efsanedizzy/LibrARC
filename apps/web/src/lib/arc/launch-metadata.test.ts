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
  decodeCreatorInitialPurchaseEventFromReceipt,
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

test("decodes the exact CreatorInitialPurchaseExecuted event from a wallet receipt", () => {
  const factoryAddress = getAddress("0xc94503F5DcDc43B0a4693C689a7520ccfd2bA0fA");
  const creator = getAddress("0x1111111111111111111111111111111111111111");
  const recipient = getAddress("0x4444444444444444444444444444444444444444");
  const launchPool = getAddress("0x3333333333333333333333333333333333333333");
  const topics = encodeEventTopics({
    abi: launchFactoryAbi,
    eventName: "CreatorInitialPurchaseExecuted",
    args: {
      launchId: 7n,
      creator,
      recipient
    }
  }).flatMap((topic): string[] => {
    if (typeof topic === "string") {
      return [topic];
    }

    throw new Error(
      "The CreatorInitialPurchaseExecuted fixture expected only flat indexed topics."
    );
  });
  const log = {
    address: factoryAddress,
    data: encodeAbiParameters(
      [
        { name: "launchPool", type: "address" },
        { name: "usdcAmountIn", type: "uint256" },
        { name: "tokenAmountOut", type: "uint256" }
      ],
      [launchPool, 2_500_000n, 987_654_321n]
    ),
    topics
  };

  const decoded = decodeCreatorInitialPurchaseEventFromReceipt(
    {
      logs: [log]
    },
    factoryAddress
  );

  assert.ok(decoded);
  assert.equal(decoded?.launchId, "7");
  assert.equal(decoded?.creator, creator);
  assert.equal(decoded?.recipient, recipient);
  assert.equal(decoded?.launchPool, launchPool);
  assert.equal(decoded?.usdcAmountIn, "2500000");
  assert.equal(decoded?.tokenAmountOut, "987654321");
});

test("unrelated receipt logs are ignored safely before LaunchCreated", () => {
  const factoryAddress = getAddress("0xc94503F5DcDc43B0a4693C689a7520ccfd2bA0fA");
  const creator = getAddress("0x1111111111111111111111111111111111111111");
  const launchToken = getAddress("0x2222222222222222222222222222222222222222");
  const launchPool = getAddress("0x3333333333333333333333333333333333333333");
  const approvalTopics = encodeEventTopics({
    abi: launchFactoryAbi,
    eventName: "CreatorInitialPurchaseExecuted",
    args: {
      launchId: 7n,
      creator,
      recipient: getAddress("0x4444444444444444444444444444444444444444")
    }
  }).flatMap((topic): string[] => {
    if (typeof topic === "string") {
      return [topic];
    }

    throw new Error("The unrelated fixture expected only flat indexed topics.");
  });
  const launchTopics = encodeEventTopics({
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

  const decoded = decodeLaunchCreatedEventFromReceipt(
    {
      logs: [
        {
          address: factoryAddress,
          data: encodeAbiParameters(
            [
              { name: "launchPool", type: "address" },
              { name: "usdcAmountIn", type: "uint256" },
              { name: "tokenAmountOut", type: "uint256" }
            ],
            [launchPool, 2_500_000n, 123n]
          ),
          topics: approvalTopics
        },
        {
          address: factoryAddress,
          data: encodeAbiParameters(
            [
              { name: "launchPool", type: "address" },
              { name: "name", type: "string" },
              { name: "symbol", type: "string" },
              { name: "metadataUri", type: "string" },
              { name: "metadataHash", type: "bytes32" }
            ],
            [
              launchPool,
              "Arc Nova",
              "ARCN",
              "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D",
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            ]
          ),
          topics: launchTopics
        }
      ]
    },
    factoryAddress
  );

  assert.equal(decoded.launchPool, launchPool);
  assert.equal(decoded.launchToken, launchToken);
});

test("exact factory-address filtering ignores LaunchCreated logs from other addresses", () => {
  const factoryAddress = getAddress("0xc94503F5DcDc43B0a4693C689a7520ccfd2bA0fA");
  const otherFactoryAddress = getAddress("0x9999999999999999999999999999999999999999");
  const creator = getAddress("0x1111111111111111111111111111111111111111");
  const launchToken = getAddress("0x2222222222222222222222222222222222222222");
  const launchPool = getAddress("0x3333333333333333333333333333333333333333");
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

  assert.throws(
    () =>
      decodeLaunchCreatedEventFromReceipt(
        {
          logs: [
            {
              address: otherFactoryAddress,
              data: encodeAbiParameters(
                [
                  { name: "launchPool", type: "address" },
                  { name: "name", type: "string" },
                  { name: "symbol", type: "string" },
                  { name: "metadataUri", type: "string" },
                  { name: "metadataHash", type: "bytes32" }
                ],
                [
                  launchPool,
                  "Arc Nova",
                  "ARCN",
                  "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D",
                  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                ]
              ),
              topics
            }
          ]
        },
        factoryAddress
      ),
    /LaunchCreated event was not found/i
  );
});

test("optional initial-purchase event absence does not fail launch success decoding", () => {
  const factoryAddress = getAddress("0xc94503F5DcDc43B0a4693C689a7520ccfd2bA0fA");
  const creator = getAddress("0x1111111111111111111111111111111111111111");
  const launchToken = getAddress("0x2222222222222222222222222222222222222222");
  const launchPool = getAddress("0x3333333333333333333333333333333333333333");
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
  const receipt = {
    logs: [
      {
        address: factoryAddress,
        data: encodeAbiParameters(
          [
            { name: "launchPool", type: "address" },
            { name: "name", type: "string" },
            { name: "symbol", type: "string" },
            { name: "metadataUri", type: "string" },
            { name: "metadataHash", type: "bytes32" }
          ],
          [
            launchPool,
            "Arc Nova",
            "ARCN",
            "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D",
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ]
        ),
        topics
      }
    ]
  };

  const launchCreated = decodeLaunchCreatedEventFromReceipt(receipt, factoryAddress);
  const initialPurchase = decodeCreatorInitialPurchaseEventFromReceipt(receipt, factoryAddress);

  assert.equal(launchCreated.launchId, "7");
  assert.equal(initialPurchase, null);
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

test("accepts normalized website and social metadata links", () => {
  const parsed = parseLaunchMetadataUri(
    `data:application/json,${encodeURIComponent(
      JSON.stringify({
        description: "  Arc launch  ",
        socials: {
          discord: "https://discord.gg/librarc",
          telegram: "https://t.me/librarc",
          x: "https://x.com/librarc"
        },
        website: "https://librarc.app/path#hash"
      })
    )}`
  );

  assert.equal(parsed.description, "Arc launch");
  assert.equal(parsed.website, "https://librarc.app/path");
  assert.equal(parsed.x, "https://x.com/librarc");
  assert.equal(parsed.telegram, "https://t.me/librarc");
  assert.equal(parsed.discord, "https://discord.gg/librarc");
});

test("supports legacy metadata aliases for x, telegram, discord, and website", () => {
  const parsed = parseLaunchMetadataUri(
    `data:application/json,${encodeURIComponent(
      JSON.stringify({
        discordUrl: "https://discord.com/invite/librarc",
        telegramUrl: "https://telegram.me/librarc",
        twitterUrl: "https://twitter.com/librarc",
        websiteUrl: "https://app.librarc.xyz"
      })
    )}`
  );

  assert.equal(parsed.website, "https://app.librarc.xyz/");
  assert.equal(parsed.x, "https://twitter.com/librarc");
  assert.equal(parsed.telegram, "https://telegram.me/librarc");
  assert.equal(parsed.discord, "https://discord.com/invite/librarc");
});

test("rejects invalid protocols and mismatched social domains safely", () => {
  const parsed = parseLaunchMetadataUri(
    `data:application/json,${encodeURIComponent(
      JSON.stringify({
        description: "<b>Arc launch</b>",
        discord: "javascript:alert(1)",
        telegram: "https://example.com/not-telegram",
        twitter: "data:text/plain,hello",
        website: "file:///unsafe/path"
      })
    )}`
  );

  assert.equal(parsed.description, "<b>Arc launch</b>");
  assert.equal(parsed.website, undefined);
  assert.equal(parsed.x, undefined);
  assert.equal(parsed.telegram, undefined);
  assert.equal(parsed.discord, undefined);
});
