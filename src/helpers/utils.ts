import { encodePacked, keccak256 } from "viem";

const UINT64_MAX = 18446744073709551615n;

export const getDateFromTimestamp = (timestamp: bigint): string | undefined => {
  if (timestamp < 0n || timestamp >= UINT64_MAX) return undefined;
  const ms =
    timestamp >= 10_000_000_000n
      ? Number(timestamp)
      : Number(timestamp) * 1000;
  return new Date(ms).toISOString();
};

export const getTimestampMs = (timestamp: bigint): number => {
  return timestamp >= 10_000_000_000n
    ? Number(timestamp)
    : Number(timestamp) * 1000;
};

export const getDonationId = (
  blockNumber: number,
  logIndex: number,
): string => {
  return keccak256(
    encodePacked(["string"], [`${blockNumber}-${logIndex}`]),
  );
};
