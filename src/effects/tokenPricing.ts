import { createEffect, S } from "envio";

function tokenCodeToCoingeckoId(code: string): string {
  const map: Record<string, string> = {
    ETH: "ethereum",
    USDC: "usd-coin",
    DAI: "dai",
    MATIC: "matic-network",
    AVAX: "avalanche-2",
    FTM: "fantom",
    OP: "optimism",
    ARB: "arbitrum",
    XDAI: "xdai",
    GTC: "gitcoin",
    LYX: "lukso-token-2",
    CELO: "celo",
    CUSD: "celo-dollar",
    METIS: "metis-token",
    SEI: "sei-network",
    HBAR: "hedera-hashgraph",
    USDT: "tether",
    LUSD: "liquity-usd",
    USDGLO: "glo-dollar",
    DATA: "streamr",
    eBTC: "ebtc",
    WLYX: "lukso-token-2",
    WSEI: "sei-network",
    MUTE: "mute",
  };
  return map[code] ?? code.toLowerCase();
}

export const tokenPricingEffect = createEffect({
  name: "tokenPricing",
  input: {
    tokenCode: S.string,
    timestampMs: S.number,
  },
  output: S.nullable(S.schema({ priceUsd: S.number })),
  cache: true,
  rateLimit: { calls: 5, per: "second" },
}, async ({ input }) => {
  try {
    const { tokenCode, timestampMs } = input;
    const date = new Date(timestampMs);
    const dateStr = `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;

    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${tokenCodeToCoingeckoId(tokenCode)}/history?date=${dateStr}`,
    );

    if (!response.ok) return undefined;

    const data = (await response.json()) as any;
    const priceUsd = data?.market_data?.current_price?.usd;

    if (typeof priceUsd !== "number") return undefined;

    return { priceUsd };
  } catch {
    return undefined;
  }
});
