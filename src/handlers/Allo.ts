import { Allo } from "generated";
import { getAddress, parseUnits } from "viem";
import { roundId, projectId, roundRoleId, pendingRoundRoleId } from "../helpers/ids.js";
import { getRoundRoles } from "../helpers/roles.js";
import { getToken, ALLO_NATIVE_TOKEN } from "../helpers/tokens.js";
import { calculateAmountInUsd } from "../helpers/tokenMath.js";
import { getDateFromTimestamp } from "../helpers/utils.js";
import { ipfsMetadataEffect, parseIpfsResult } from "../effects/ipfsMetadata.js";
import { tokenPricingEffect } from "../effects/tokenPricing.js";
import { strategyTimingsEffect } from "../effects/strategyTimings.js";
import { RoundMetadataSchema } from "../schemas/roundMetadata.js";

Allo.PoolCreated.contractRegister(({ event, context }) => {
  context.addStrategy(event.params.strategy);
});

Allo.PoolCreated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const poolId = event.params.poolId;
  const id = roundId(chainId, poolId);
  const strategyAddress = getAddress(event.params.strategy);
  const profileId = event.params.profileId;
  const projId = projectId(chainId, profileId);

  // Resolve token address (native token → 0xEeee...)
  let tokenAddress = getAddress(event.params.token);
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    tokenAddress = getAddress(ALLO_NATIVE_TOKEN);
  }
  const token = getToken(chainId, tokenAddress);

  // Fetch metadata
  const roundMetadataCid = event.params.metadata[1];
  const roundMetadataRaw = parseIpfsResult(await context.effect(ipfsMetadataEffect, roundMetadataCid));

  let roundMetadata = roundMetadataRaw;
  let matchAmount = 0n;
  let matchAmountInUsd = "0";

  if (roundMetadataRaw) {
    const parsed = RoundMetadataSchema.safeParse(roundMetadataRaw);
    if (parsed.success) {
      roundMetadata = parsed.data;
      const matchingFundsAvailable = parsed.data.quadraticFundingConfig?.matchingFundsAvailable;
      if (matchingFundsAvailable && token) {
        matchAmount = parseUnits(matchingFundsAvailable.toString(), token.decimals);
        // Get token price to convert match amount to USD
        const timestampMs = event.block.timestamp * 1000;
        const priceResult = await context.effect(tokenPricingEffect, {
          tokenCode: token.priceSourceCode,
          timestampMs,
        });
        if (priceResult) {
          matchAmountInUsd = calculateAmountInUsd(matchAmount, priceResult.priceUsd, token.decimals);
        }
      }
    }
  }

  // Calculate funded amount in USD
  const fundedAmount = event.params.amount;
  let fundedAmountInUsd = "0";
  if (fundedAmount > 0n && token) {
    const timestampMs = event.block.timestamp * 1000;
    const priceResult = await context.effect(tokenPricingEffect, {
      tokenCode: token.priceSourceCode,
      timestampMs,
    });
    if (priceResult) {
      fundedAmountInUsd = calculateAmountInUsd(fundedAmount, priceResult.priceUsd, token.decimals);
    }
  }

  // Compute role hashes
  const { managerRole, adminRole } = getRoundRoles(poolId);

  // Fetch strategy timings via RPC
  const timings = await context.effect(strategyTimingsEffect, {
    strategyAddress,
    chainId,
    strategyType: "dvmd", // Default — will be refined
  });

  const applicationsStartTime = timings ? getDateFromTimestamp(BigInt(timings.applicationsStartTime)) : undefined;
  const applicationsEndTime = timings ? getDateFromTimestamp(BigInt(timings.applicationsEndTime)) : undefined;
  const donationsStartTime = timings?.donationsStartTime ? getDateFromTimestamp(BigInt(timings.donationsStartTime)) : undefined;
  const donationsEndTime = timings?.donationsEndTime ? getDateFromTimestamp(BigInt(timings.donationsEndTime)) : undefined;

  const createdByAddress = event.transaction.from
    ? getAddress(event.transaction.from)
    : getAddress("0x0000000000000000000000000000000000000000");

  context.Round.set({
    id,
    chainId,
    matchAmount,
    matchTokenAddress: tokenAddress,
    matchAmountInUsd,
    fundedAmount,
    fundedAmountInUsd,
    applicationMetadataCid: "",
    applicationMetadata: undefined,
    roundMetadataCid: roundMetadataCid || undefined,
    roundMetadata,
    applicationsStartTime,
    applicationsEndTime,
    donationsStartTime,
    donationsEndTime,
    createdByAddress,
    createdAtBlock: BigInt(event.block.number),
    updatedAtBlock: BigInt(event.block.number),
    totalAmountDonatedInUsd: "0",
    totalDonationsCount: 0,
    totalDistributed: 0n,
    uniqueDonorsCount: 0,
    managerRole,
    adminRole,
    strategyAddress,
    strategyId: "",
    strategyName: "unknown",
    readyForPayoutTransaction: undefined,
    matchingDistribution: undefined,
    project_id: projId,
    tags: ["allo-v2"],
    timestamp: new Date(event.block.timestamp * 1000).toISOString(),
  });

  // Convert pending round roles to actual roles
  const pendingAdminRoles = await context.PendingRoundRole.getWhere({ role: { _eq: adminRole } });
  for (const pending of pendingAdminRoles) {
    if (pending.chainId !== chainId) continue;
    const roleEntityId = roundRoleId(chainId, id, "admin", pending.address);
    context.RoundRole.set({
      id: roleEntityId,
      chainId,
      round_id: id,
      address: pending.address,
      role: "admin",
      createdAtBlock: pending.createdAtBlock,
    });
    context.PendingRoundRole.deleteUnsafe(pending.id);
  }

  const pendingManagerRoles = await context.PendingRoundRole.getWhere({ role: { _eq: managerRole } });
  for (const pending of pendingManagerRoles) {
    if (pending.chainId !== chainId) continue;
    const roleEntityId = roundRoleId(chainId, id, "manager", pending.address);
    context.RoundRole.set({
      id: roleEntityId,
      chainId,
      round_id: id,
      address: pending.address,
      role: "manager",
      createdAtBlock: pending.createdAtBlock,
    });
    context.PendingRoundRole.deleteUnsafe(pending.id);
  }
});

Allo.PoolFunded.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const id = roundId(chainId, event.params.poolId);
  const round = await context.Round.get(id);
  if (!round) return;

  const token = getToken(chainId, round.matchTokenAddress);
  const newFundedAmount = round.fundedAmount + event.params.amount;
  let newFundedAmountInUsd = round.fundedAmountInUsd;

  if (token && event.params.amount > 0n) {
    const timestampMs = event.block.timestamp * 1000;
    const priceResult = await context.effect(tokenPricingEffect, {
      tokenCode: token.priceSourceCode,
      timestampMs,
    });
    if (priceResult) {
      const additionalUsd = calculateAmountInUsd(event.params.amount, priceResult.priceUsd, token.decimals);
      const currentUsd = parseFloat(round.fundedAmountInUsd);
      newFundedAmountInUsd = (currentUsd + parseFloat(additionalUsd)).toString();
    }
  }

  context.Round.set({
    ...round,
    fundedAmount: newFundedAmount,
    fundedAmountInUsd: newFundedAmountInUsd,
    updatedAtBlock: BigInt(event.block.number),
  });
});

Allo.PoolMetadataUpdated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const id = roundId(chainId, event.params.poolId);
  const round = await context.Round.get(id);
  if (!round) return;

  const metadataCid = event.params.metadata[1];
  const metadataRaw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));

  let roundMetadata = metadataRaw;
  let matchAmount = round.matchAmount;
  let matchAmountInUsd = round.matchAmountInUsd;

  if (metadataRaw) {
    const parsed = RoundMetadataSchema.safeParse(metadataRaw);
    if (parsed.success) {
      roundMetadata = parsed.data;
      const matchingFundsAvailable = parsed.data.quadraticFundingConfig?.matchingFundsAvailable;
      const token = getToken(chainId, round.matchTokenAddress);
      if (matchingFundsAvailable && token) {
        matchAmount = parseUnits(matchingFundsAvailable.toString(), token.decimals);
        const timestampMs = event.block.timestamp * 1000;
        const priceResult = await context.effect(tokenPricingEffect, {
          tokenCode: token.priceSourceCode,
          timestampMs,
        });
        if (priceResult) {
          matchAmountInUsd = calculateAmountInUsd(matchAmount, priceResult.priceUsd, token.decimals);
        }
      }
    }
  }

  context.Round.set({
    ...round,
    roundMetadataCid: metadataCid || undefined,
    roundMetadata,
    matchAmount,
    matchAmountInUsd,
    updatedAtBlock: BigInt(event.block.number),
  });
});

Allo.AlloRoleGranted.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const role = event.params.role;
  const account = getAddress(event.params.account);

  const adminRounds = await context.Round.getWhere({ adminRole: { _eq: role } });
  const adminRound = adminRounds.find((r) => r.chainId === chainId);
  if (adminRound) {
    const roleEntityId = roundRoleId(chainId, adminRound.id, "admin", account);
    context.RoundRole.set({
      id: roleEntityId,
      chainId,
      round_id: adminRound.id,
      address: account,
      role: "admin",
      createdAtBlock: BigInt(event.block.number),
    });
    return;
  }

  const managerRounds = await context.Round.getWhere({ managerRole: { _eq: role } });
  const managerRound = managerRounds.find((r) => r.chainId === chainId);
  if (managerRound) {
    const roleEntityId = roundRoleId(chainId, managerRound.id, "manager", account);
    context.RoundRole.set({
      id: roleEntityId,
      chainId,
      round_id: managerRound.id,
      address: account,
      role: "manager",
      createdAtBlock: BigInt(event.block.number),
    });
    return;
  }

  // Round doesn't exist yet — store as pending
  const pendingId = pendingRoundRoleId(chainId, role, account);
  context.PendingRoundRole.set({
    id: pendingId,
    chainId,
    role,
    address: account,
    createdAtBlock: BigInt(event.block.number),
  });
});

Allo.AlloRoleRevoked.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const role = event.params.role;
  const account = getAddress(event.params.account);

  const adminRounds = await context.Round.getWhere({ adminRole: { _eq: role } });
  const adminRound = adminRounds.find((r) => r.chainId === chainId);
  if (adminRound) {
    const roleEntityId = roundRoleId(chainId, adminRound.id, "admin", account);
    context.RoundRole.deleteUnsafe(roleEntityId);
    return;
  }

  const managerRounds = await context.Round.getWhere({ managerRole: { _eq: role } });
  const managerRound = managerRounds.find((r) => r.chainId === chainId);
  if (managerRound) {
    const roleEntityId = roundRoleId(chainId, managerRound.id, "manager", account);
    context.RoundRole.deleteUnsafe(roleEntityId);
    return;
  }
});
