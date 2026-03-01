export const roundId = (chainId: number, poolId: bigint): string =>
  `${chainId}_${poolId}`;

export const projectId = (chainId: number, profileId: string): string =>
  `${chainId}_${profileId}`;

export const applicationId = (
  chainId: number,
  poolId: bigint,
  applicationIndex: string,
): string => `${chainId}_${poolId}_${applicationIndex}`;

export const donationId = (chainId: number, hash: string): string =>
  `${chainId}_${hash}`;

export const applicationPayoutId = (chainId: number, hash: string): string =>
  `${chainId}_${hash}`;

export const roundRoleId = (
  chainId: number,
  roundEntityId: string,
  role: string,
  address: string,
): string => `${chainId}_${roundEntityId}_${role}_${address}`;

export const projectRoleId = (
  chainId: number,
  projectEntityId: string,
  role: string,
  address: string,
): string => `${chainId}_${projectEntityId}_${role}_${address}`;

export const pendingRoundRoleId = (
  chainId: number,
  role: string,
  address: string,
): string => `${chainId}_${role}_${address}`;

export const pendingProjectRoleId = (
  chainId: number,
  role: string,
  address: string,
): string => `${chainId}_${role}_${address}`;
