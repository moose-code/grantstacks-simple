import { createEffect, S } from "envio";
import { createPublicClient, http, type Address } from "viem";
import {
  dvmdStrategyAbi,
  dgLiteStrategyAbi,
  easyRetroFundingStrategyAbi,
  dgSimpleStrategyAbi,
} from "../abis/strategies.js";

const CHAIN_RPC_URLS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  10: "https://optimism.llamarpc.com",
  42: "https://rpc.mainnet.lukso.network",
  100: "https://gnosis-rpc.publicnode.com",
  137: "https://polygon.llamarpc.com",
  250: "https://rpc.ankr.com/fantom",
  295: "https://mainnet.hashio.io/api",
  324: "https://1rpc.io/zksync2-era",
  1088: "https://metis-rpc.publicnode.com",
  1329: "https://evm-rpc.sei-apis.com",
  8453: "https://base-rpc.publicnode.com",
  42161: "https://arbitrum.llamarpc.com",
  42220: "https://1rpc.io/celo",
  43114: "https://avalanche.public-rpc.com",
  534352: "https://1rpc.io/scroll",
  11155111: "https://1rpc.io/sepolia",
};

export const strategyTimingsEffect = createEffect({
  name: "strategyTimings",
  input: {
    strategyAddress: S.string,
    chainId: S.number,
    strategyType: S.string,
  },
  output: S.nullable(S.schema({
    applicationsStartTime: S.number,
    applicationsEndTime: S.number,
    donationsStartTime: S.nullable(S.number),
    donationsEndTime: S.nullable(S.number),
  })),
  cache: true,
  rateLimit: false,
}, async ({ input }) => {
  const { strategyAddress, chainId, strategyType } = input;
  const rpcUrl = CHAIN_RPC_URLS[chainId];
  if (!rpcUrl || strategyType === "unknown") return undefined;

  try {
    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    const address = strategyAddress as Address;

    if (strategyType === "dvmd") {
      const [regStart, regEnd, allocStart, allocEnd] = await Promise.all([
        client.readContract({ address, abi: dvmdStrategyAbi, functionName: "registrationStartTime" }),
        client.readContract({ address, abi: dvmdStrategyAbi, functionName: "registrationEndTime" }),
        client.readContract({ address, abi: dvmdStrategyAbi, functionName: "allocationStartTime" }),
        client.readContract({ address, abi: dvmdStrategyAbi, functionName: "allocationEndTime" }),
      ]);
      return {
        applicationsStartTime: Number(regStart),
        applicationsEndTime: Number(regEnd),
        donationsStartTime: Number(allocStart),
        donationsEndTime: Number(allocEnd),
      };
    }

    if (strategyType === "dgLite" || strategyType === "dgSimple") {
      const abi = strategyType === "dgLite" ? dgLiteStrategyAbi : dgSimpleStrategyAbi;
      const [regStart, regEnd] = await Promise.all([
        client.readContract({ address, abi, functionName: "registrationStartTime" }),
        client.readContract({ address, abi, functionName: "registrationEndTime" }),
      ]);
      return {
        applicationsStartTime: Number(regStart),
        applicationsEndTime: Number(regEnd),
        donationsStartTime: undefined,
        donationsEndTime: undefined,
      };
    }

    if (strategyType === "easyRetroFunding") {
      const [regStart, regEnd, poolStart, poolEnd] = await Promise.all([
        client.readContract({ address, abi: easyRetroFundingStrategyAbi, functionName: "registrationStartTime" }),
        client.readContract({ address, abi: easyRetroFundingStrategyAbi, functionName: "registrationEndTime" }),
        client.readContract({ address, abi: easyRetroFundingStrategyAbi, functionName: "poolStartTime" }),
        client.readContract({ address, abi: easyRetroFundingStrategyAbi, functionName: "poolEndTime" }),
      ]);
      return {
        applicationsStartTime: Number(regStart),
        applicationsEndTime: Number(regEnd),
        donationsStartTime: Number(poolStart),
        donationsEndTime: Number(poolEnd),
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
});
