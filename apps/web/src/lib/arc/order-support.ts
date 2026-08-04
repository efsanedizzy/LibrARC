import { launchFactoryAbi, launchPoolAbi, librarcTokenAbi } from "./abis";

export const ORDER_CAPABILITIES = [
  "placing limit orders",
  "cancelling limit orders",
  "executing limit orders",
  "order expiry",
  "order escrow",
  "open-order enumeration",
  "filled-order enumeration"
] as const;

const ORDER_FUNCTION_NAMES = [
  "placeLimitOrder",
  "cancelLimitOrder",
  "executeLimitOrder",
  "fillLimitOrder",
  "getOrder",
  "getOrdersByOwner",
  "getOpenOrders",
  "getFilledOrders"
] as const;

const ORDER_EVENT_NAMES = [
  "LimitOrderPlaced",
  "LimitOrderCancelled",
  "LimitOrderExecuted",
  "OrderFilled",
  "OrderExpired"
] as const;

function collectAbiNames() {
  const functionNames = new Set<string>();
  const eventNames = new Set<string>();

  for (const entry of [...launchFactoryAbi, ...launchPoolAbi, ...librarcTokenAbi]) {
    if (entry.type === "function") {
      functionNames.add(entry.name);
    }

    if (entry.type === "event") {
      eventNames.add(entry.name);
    }
  }

  return {
    eventNames,
    functionNames
  };
}

export function inspectArcOrderSupport() {
  const { eventNames, functionNames } = collectAbiNames();
  const supportedFunctions = ORDER_FUNCTION_NAMES.filter((name) => functionNames.has(name));
  const supportedEvents = ORDER_EVENT_NAMES.filter((name) => eventNames.has(name));
  const supportsLimitOrders =
    supportedFunctions.length === ORDER_FUNCTION_NAMES.length && supportedEvents.length >= 2;

  return {
    missingCapabilities: [...ORDER_CAPABILITIES],
    supportedEvents,
    supportedFunctions,
    supportsLimitOrders
  } as const;
}

export const ARC_ORDER_SUPPORT = inspectArcOrderSupport();
