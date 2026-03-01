import { encodePacked, keccak256, pad } from "viem";

export const getRoundRoles = (
  poolId: bigint,
): { managerRole: string; adminRole: string } => {
  const managerRole = pad(`0x${poolId.toString(16)}`);
  const adminRawRole = encodePacked(
    ["uint256", "string"],
    [poolId, "admin"],
  );
  const adminRole = keccak256(adminRawRole);
  return { managerRole, adminRole };
};
