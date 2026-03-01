const APPLICATION_STATUS_NAMES = [
  "NONE",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "IN_REVIEW",
] as const;

type ApplicationStatusName = (typeof APPLICATION_STATUS_NAMES)[number];

export function statusIndexToName(index: number): ApplicationStatusName {
  return APPLICATION_STATUS_NAMES[index] ?? "NONE";
}

export function isValidApplicationStatus(status: number): boolean {
  return status >= 1 && status <= 5;
}

export function createStatusUpdate(
  currentStatus: string,
  currentSnapshots: unknown[],
  newStatus: string,
  blockNumber: number,
  blockTimestamp: number,
): {
  status: string;
  statusUpdatedAtBlock: bigint;
  statusSnapshots: unknown[];
} {
  const statusSnapshots = [...currentSnapshots];

  if (currentStatus !== newStatus) {
    statusSnapshots.push({
      status: newStatus,
      updatedAtBlock: blockNumber.toString(),
      updatedAt: new Date(blockTimestamp).toISOString(),
    });
  }

  return {
    status: newStatus,
    statusUpdatedAtBlock: BigInt(blockNumber),
    statusSnapshots,
  };
}
