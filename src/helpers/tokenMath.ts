import BigNumber from "bignumber.js";

export const calculateAmountInUsd = (
  amount: bigint,
  tokenPriceInUsd: string | number,
  tokenDecimals: number,
  truncateDecimals?: number,
): string => {
  const amountBN = new BigNumber(amount.toString());
  const tokenPriceBN = new BigNumber(tokenPriceInUsd.toString());
  const scaleFactor = new BigNumber(10).pow(tokenDecimals);

  let amountInUsd = amountBN
    .multipliedBy(tokenPriceBN)
    .dividedBy(scaleFactor);

  if (truncateDecimals !== undefined) {
    amountInUsd = amountInUsd.decimalPlaces(truncateDecimals);
  }

  return amountInUsd.toString();
};

export const calculateAmountInToken = (
  amountInUSD: string,
  tokenPriceInUsd: string | number,
  tokenDecimals: number,
): bigint => {
  const amountInUsdBN = new BigNumber(amountInUSD);
  const tokenPriceInUsdBN = new BigNumber(tokenPriceInUsd);
  const scaleFactor = new BigNumber(10).pow(tokenDecimals);

  return BigInt(
    amountInUsdBN
      .multipliedBy(scaleFactor)
      .dividedBy(tokenPriceInUsdBN)
      .toFixed(0, BigNumber.ROUND_FLOOR),
  );
};
