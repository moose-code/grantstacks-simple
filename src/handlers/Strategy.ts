import { Strategy } from "generated";
import { getAddress, type Hex } from "viem";
import { roundId, applicationId, donationId, applicationPayoutId } from "../helpers/ids.js";
import { getToken, ALLO_NATIVE_TOKEN } from "../helpers/tokens.js";
import { calculateAmountInUsd, calculateAmountInToken } from "../helpers/tokenMath.js";
import { getDateFromTimestamp, getDonationId } from "../helpers/utils.js";
import {
  decodeDVMDExtendedApplicationData,
  decodeDGApplicationData,
} from "../helpers/decoders.js";
import { isValidApplicationStatus, statusIndexToName, createStatusUpdate } from "../helpers/applicationStatus.js";
import { getStrategyInfo, type StrategyType } from "../helpers/strategyMapping.js";
import { ipfsMetadataEffect, parseIpfsResult } from "../effects/ipfsMetadata.js";
import { tokenPricingEffect } from "../effects/tokenPricing.js";
import { ApplicationMetadataSchema } from "../schemas/applicationMetadata.js";
import {
  MatchingDistributionSchema,
  SimpleMatchingDistributionSchema,
} from "../schemas/matchingDistribution.js";

// Helper: find round by strategy address
async function findRoundByStrategy(
  context: any,
  strategyAddress: string,
  chainId: number,
) {
  const rounds = await context.Round.getWhere({ strategyAddress: { _eq: getAddress(strategyAddress) } });
  return rounds.find((r: any) => r.chainId === chainId) ?? null;
}

// Helper: find application by anchor address and round
async function findApplicationByAnchor(
  context: any,
  anchorAddress: string,
  roundEntityId: string,
) {
  const apps = await context.Application.getWhere({ anchorAddress: { _eq: getAddress(anchorAddress) } });
  return apps.find((a: any) => a.round_id === roundEntityId) ?? null;
}

// ============================================================================
// REGISTERED
// ============================================================================

Strategy.RegisteredWithSender.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const strategyType = getStrategyInfo(round.strategyId).type;
  const recipientId = event.params.recipientId;
  const data = event.params.data as Hex;

  // Find project by anchor (recipientId is the anchor address)
  const projects = await context.Project.getWhere({ anchorAddress: { _eq: getAddress(recipientId) } });
  const project = projects[0];
  if (!project) return;

  let appIndex: string;
  let anchorAddress: string;
  let metadataCid: string | undefined;

  // Try multiple decoders since strategyId may not be set yet
  let decoded = false;

  if (strategyType === "dgSimple") {
    try {
      const result = decodeDGApplicationData(data);
      appIndex = recipientId;
      anchorAddress = result.anchorAddress;
      metadataCid = result.metadata.pointer || undefined;
      decoded = true;
    } catch {
      // Fall through to DVMD decoder
    }
  }

  if (!decoded) {
    try {
      const result = decodeDVMDExtendedApplicationData(data);
      appIndex = (BigInt(result.recipientsCounter) - 1n).toString();
      anchorAddress = result.anchorAddress;
      metadataCid = result.metadata.pointer || undefined;
      decoded = true;
    } catch {
      // Try DG decoder as fallback
    }
  }

  if (!decoded) {
    try {
      const result = decodeDGApplicationData(data);
      appIndex = recipientId;
      anchorAddress = result.anchorAddress;
      metadataCid = result.metadata.pointer || undefined;
      decoded = true;
    } catch {
      // Cannot decode — skip this event
      return;
    }
  }

  const appEntityId = applicationId(chainId, BigInt(round.id.split("_")[1]), appIndex!);

  // Fetch application metadata
  let metadata: unknown = undefined;
  if (metadataCid) {
    const raw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));
    if (raw) {
      const parsed = ApplicationMetadataSchema.safeParse(raw);
      metadata = parsed.success ? parsed.data : raw;
    }
  }

  const createdByAddress = event.transaction.from
    ? getAddress(event.transaction.from)
    : getAddress(event.params.sender);

  context.Application.set({
    id: appEntityId,
    chainId,
    round_id: round.id,
    project_id: project.id,
    anchorAddress: getAddress(anchorAddress!),
    status: "PENDING",
    statusSnapshots: [
      {
        status: "PENDING",
        updatedAtBlock: event.block.number.toString(),
        updatedAt: new Date(event.block.timestamp * 1000).toISOString(),
      },
    ],
    distributionTransaction: undefined,
    metadataCid,
    metadata,
    createdByAddress,
    createdAtBlock: BigInt(event.block.number),
    statusUpdatedAtBlock: BigInt(event.block.number),
    totalDonationsCount: 0,
    totalAmountDonatedInUsd: "0",
    uniqueDonorsCount: 0,
    timestamp: new Date(event.block.timestamp * 1000).toISOString(),
    tags: ["allo-v2"],
  });
});

Strategy.RegisteredWithData.handler(async ({ event, context }) => {
  // Legacy registration event — handle similarly to RegisteredWithSender
  // but without sender field
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const recipientId = event.params._recipient;
  const projects = await context.Project.getWhere({ anchorAddress: { _eq: getAddress(recipientId) } });
  const project = projects[0];
  if (!project) return;

  const data = event.params._data as Hex;
  let appIndex: string;
  let anchorAddress: string;
  let metadataCid: string | undefined;

  try {
    const decoded = decodeDVMDExtendedApplicationData(data);
    appIndex = (BigInt(decoded.recipientsCounter) - 1n).toString();
    anchorAddress = decoded.anchorAddress;
    metadataCid = decoded.metadata.pointer || undefined;
  } catch {
    return;
  }

  const appEntityId = applicationId(chainId, BigInt(round.id.split("_")[1]), appIndex!);

  let metadata: unknown = undefined;
  if (metadataCid) {
    const raw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));
    if (raw) {
      const parsed = ApplicationMetadataSchema.safeParse(raw);
      metadata = parsed.success ? parsed.data : raw;
    }
  }

  const createdByAddress = event.transaction.from
    ? getAddress(event.transaction.from)
    : getAddress("0x0000000000000000000000000000000000000000");

  context.Application.set({
    id: appEntityId,
    chainId,
    round_id: round.id,
    project_id: project.id,
    anchorAddress: getAddress(anchorAddress!),
    status: "PENDING",
    statusSnapshots: [
      {
        status: "PENDING",
        updatedAtBlock: event.block.number.toString(),
        updatedAt: new Date(event.block.timestamp * 1000).toISOString(),
      },
    ],
    distributionTransaction: undefined,
    metadataCid,
    metadata,
    createdByAddress,
    createdAtBlock: BigInt(event.block.number),
    statusUpdatedAtBlock: BigInt(event.block.number),
    totalDonationsCount: 0,
    totalAmountDonatedInUsd: "0",
    uniqueDonorsCount: 0,
    timestamp: new Date(event.block.timestamp * 1000).toISOString(),
    tags: ["allo-v2"],
  });
});

// ============================================================================
// ALLOCATED (Donations & Payouts)
// ============================================================================

Strategy.AllocatedWithOrigin.handler(async ({ event, context }) => {
  // This creates a Donation (DVMD strategy)
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const recipientId = event.params.recipientId;
  const application = await findApplicationByAnchor(context, recipientId, round.id);

  let tokenAddress = getAddress(event.params.token);
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    tokenAddress = getAddress(ALLO_NATIVE_TOKEN);
  }
  const token = getToken(chainId, tokenAddress);

  const amount = event.params.amount;
  let amountInUsd = "0";
  let amountInRoundMatchToken = 0n;

  if (token && amount > 0n) {
    const timestampMs = event.block.timestamp * 1000;
    const priceResult = await context.effect(tokenPricingEffect, {
      tokenCode: token.priceSourceCode,
      timestampMs,
    });
    if (priceResult) {
      amountInUsd = calculateAmountInUsd(amount, priceResult.priceUsd, token.decimals);

      // Convert to round match token if different
      const matchToken = getToken(chainId, round.matchTokenAddress);
      if (matchToken && matchToken.address !== token.address) {
        const matchPriceResult = await context.effect(tokenPricingEffect, {
          tokenCode: matchToken.priceSourceCode,
          timestampMs,
        });
        if (matchPriceResult) {
          amountInRoundMatchToken = calculateAmountInToken(
            amountInUsd,
            matchPriceResult.priceUsd,
            matchToken.decimals,
          );
        }
      } else if (matchToken) {
        amountInRoundMatchToken = amount;
      }
    }
  }

  const hash = getDonationId(event.block.number, event.logIndex);
  const donEntityId = donationId(chainId, hash);
  const donorAddress = getAddress(event.params.origin);

  // Check if this donor is new to the round/application
  const existingDonations = await context.Donation.getWhere({ donorAddress: { _eq: donorAddress } });
  const isNewDonorForRound = !existingDonations.some((d: any) => d.round_id === round.id);
  const isNewDonorForApp = application
    ? !existingDonations.some((d: any) => d.application_id === application.id)
    : false;

  context.Donation.set({
    id: donEntityId,
    chainId,
    round_id: round.id,
    application_id: application?.id ?? undefined,
    donorAddress,
    recipientAddress: getAddress(recipientId),
    project_id: application?.project_id ?? "",
    transactionHash: event.transaction.hash ?? "",
    blockNumber: BigInt(event.block.number),
    tokenAddress,
    amount,
    amountInUsd,
    amountInRoundMatchToken,
    timestamp: new Date(event.block.timestamp * 1000).toISOString(),
  });

  // Update round donation stats
  const currentDonatedUsd = parseFloat(round.totalAmountDonatedInUsd);
  context.Round.set({
    ...round,
    totalDonationsCount: round.totalDonationsCount + 1,
    totalAmountDonatedInUsd: (currentDonatedUsd + parseFloat(amountInUsd)).toString(),
    uniqueDonorsCount: round.uniqueDonorsCount + (isNewDonorForRound ? 1 : 0),
    updatedAtBlock: BigInt(event.block.number),
  });

  // Update application donation stats
  if (application) {
    const appDonatedUsd = parseFloat(application.totalAmountDonatedInUsd);
    context.Application.set({
      ...application,
      totalDonationsCount: application.totalDonationsCount + 1,
      totalAmountDonatedInUsd: (appDonatedUsd + parseFloat(amountInUsd)).toString(),
      uniqueDonorsCount: application.uniqueDonorsCount + (isNewDonorForApp ? 1 : 0),
    });
  }
});

Strategy.AllocatedWithToken.handler(async ({ event, context }) => {
  // This creates an ApplicationPayout (DGLite strategy)
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const recipientId = event.params.recipientId;
  const application = await findApplicationByAnchor(context, recipientId, round.id);
  if (!application) return;

  let tokenAddress = getAddress(event.params.token);
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    tokenAddress = getAddress(ALLO_NATIVE_TOKEN);
  }
  const token = getToken(chainId, tokenAddress);

  const amount = event.params.amount;
  let amountInUsd = "0";
  let amountInRoundMatchToken = 0n;

  if (token && amount > 0n) {
    const timestampMs = event.block.timestamp * 1000;
    const priceResult = await context.effect(tokenPricingEffect, {
      tokenCode: token.priceSourceCode,
      timestampMs,
    });
    if (priceResult) {
      amountInUsd = calculateAmountInUsd(amount, priceResult.priceUsd, token.decimals);
      const matchToken = getToken(chainId, round.matchTokenAddress);
      if (matchToken && matchToken.address !== token.address) {
        const matchPriceResult = await context.effect(tokenPricingEffect, {
          tokenCode: matchToken.priceSourceCode,
          timestampMs,
        });
        if (matchPriceResult) {
          amountInRoundMatchToken = calculateAmountInToken(
            amountInUsd,
            matchPriceResult.priceUsd,
            matchToken.decimals,
          );
        }
      } else if (matchToken) {
        amountInRoundMatchToken = amount;
      }
    }
  }

  const hash = getDonationId(event.block.number, event.logIndex);
  const payoutEntityId = applicationPayoutId(chainId, hash);

  context.ApplicationPayout.set({
    id: payoutEntityId,
    chainId,
    round_id: round.id,
    application_id: application.id,
    amount,
    tokenAddress,
    amountInUsd,
    amountInRoundMatchToken,
    transactionHash: event.transaction.hash ?? "",
    timestamp: new Date(event.block.timestamp * 1000).toISOString(),
  });

  // Increment round total distributed
  context.Round.set({
    ...round,
    totalDistributed: round.totalDistributed + amount,
    updatedAtBlock: BigInt(event.block.number),
  });
});

// No-op allocation handlers
Strategy.AllocatedWithData.handler(async () => {});
Strategy.AllocatedWithVotes.handler(async () => {});
Strategy.AllocatedWithStatus.handler(async () => {});
Strategy.AllocatedWithNft.handler(async () => {});

// DirectAllocated — creates donation without application
Strategy.DirectAllocated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const profileId = event.params.profileId;
  // Find project by profileId
  const projId = `${chainId}_${profileId}`;
  const project = await context.Project.get(projId);
  if (!project) return;

  let tokenAddress = getAddress(event.params.token);
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    tokenAddress = getAddress(ALLO_NATIVE_TOKEN);
  }
  const token = getToken(chainId, tokenAddress);

  const amount = event.params.amount;
  let amountInUsd = "0";
  let amountInRoundMatchToken = 0n;

  if (token && amount > 0n) {
    const timestampMs = event.block.timestamp * 1000;
    const priceResult = await context.effect(tokenPricingEffect, {
      tokenCode: token.priceSourceCode,
      timestampMs,
    });
    if (priceResult) {
      amountInUsd = calculateAmountInUsd(amount, priceResult.priceUsd, token.decimals);
    }
  }

  const hash = getDonationId(event.block.number, event.logIndex);
  const donEntityId = donationId(chainId, hash);
  const donorAddress = getAddress(event.params.sender);

  // Check if this donor is new to the round
  const existingDonations = await context.Donation.getWhere({ donorAddress: { _eq: donorAddress } });
  const isNewDonorForRound = !existingDonations.some((d: any) => d.round_id === round.id);

  context.Donation.set({
    id: donEntityId,
    chainId,
    round_id: round.id,
    application_id: undefined,
    donorAddress,
    recipientAddress: getAddress(event.params.profileOwner),
    project_id: project.id,
    transactionHash: event.transaction.hash ?? "",
    blockNumber: BigInt(event.block.number),
    tokenAddress,
    amount,
    amountInUsd,
    amountInRoundMatchToken,
    timestamp: new Date(event.block.timestamp * 1000).toISOString(),
  });

  // Update round stats only (no application)
  const currentDonatedUsd = parseFloat(round.totalAmountDonatedInUsd);
  context.Round.set({
    ...round,
    totalDonationsCount: round.totalDonationsCount + 1,
    totalAmountDonatedInUsd: (currentDonatedUsd + parseFloat(amountInUsd)).toString(),
    uniqueDonorsCount: round.uniqueDonorsCount + (isNewDonorForRound ? 1 : 0),
    updatedAtBlock: BigInt(event.block.number),
  });
});

// ============================================================================
// DISTRIBUTED
// ============================================================================

Strategy.DistributedWithRecipientAddress.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  // Increment totalDistributed
  context.Round.set({
    ...round,
    totalDistributed: round.totalDistributed + event.params.amount,
    updatedAtBlock: BigInt(event.block.number),
  });
});

Strategy.FundsDistributed.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  // Update application with distribution transaction
  const recipientId = event.params.recipientId;
  const application = await findApplicationByAnchor(context, recipientId, round.id);

  if (application) {
    context.Application.set({
      ...application,
      distributionTransaction: event.transaction.hash ?? undefined,
    });
  }

  // Increment totalDistributed
  context.Round.set({
    ...round,
    totalDistributed: round.totalDistributed + event.params.amount,
    updatedAtBlock: BigInt(event.block.number),
  });
});

// No-op distributed handlers
Strategy.DistributedWithData.handler(async () => {});
Strategy.DistributedWithFlowRate.handler(async () => {});

// ============================================================================
// RECIPIENT STATUS UPDATED
// ============================================================================

Strategy.RecipientStatusUpdatedWithFullRow.handler(async ({ event, context }) => {
  // Bitmap decode: each row index represents a 256-bit bitmap
  // with 64 entries, each using 4 bits
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const rowIndex = event.params.rowIndex;
  const fullRow = event.params.fullRow;
  const poolIdBigInt = BigInt(round.id.split("_")[1]);

  // Decode 64 statuses from the bitmap row
  for (let col = 0n; col < 64n; col++) {
    const statusBits = Number((fullRow >> (col * 4n)) & 0xFn);
    if (statusBits === 0 || !isValidApplicationStatus(statusBits)) continue;

    const appIndex = (rowIndex * 64n + col).toString();
    const appEntityId = applicationId(chainId, poolIdBigInt, appIndex);
    const application = await context.Application.get(appEntityId);
    if (!application) continue;

    const newStatus = statusIndexToName(statusBits);
    const update = createStatusUpdate(
      application.status,
      application.statusSnapshots as unknown[],
      newStatus,
      event.block.number,
      event.block.timestamp * 1000,
    );

    context.Application.set({
      ...application,
      status: update.status as any,
      statusUpdatedAtBlock: update.statusUpdatedAtBlock,
      statusSnapshots: update.statusSnapshots,
    });
  }
});

Strategy.RecipientStatusUpdatedWithApplicationId.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const appIndex = event.params.applicationId.toString();
  const poolIdBigInt = BigInt(round.id.split("_")[1]);
  const appEntityId = applicationId(chainId, poolIdBigInt, appIndex);
  const application = await context.Application.get(appEntityId);
  if (!application) return;

  const statusNum = Number(event.params.status);
  if (!isValidApplicationStatus(statusNum)) return;

  const newStatus = statusIndexToName(statusNum);
  const update = createStatusUpdate(
    application.status,
    application.statusSnapshots as unknown[],
    newStatus,
    event.block.number,
    event.block.timestamp * 1000,
  );

  context.Application.set({
    ...application,
    status: update.status as any,
    statusUpdatedAtBlock: update.statusUpdatedAtBlock,
    statusSnapshots: update.statusSnapshots,
  });
});

Strategy.RecipientStatusUpdatedWithRecipientStatus.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const recipientId = event.params.recipientId;
  const application = await findApplicationByAnchor(context, recipientId, round.id);
  if (!application) return;

  const statusNum = Number(event.params.recipientStatus);
  if (!isValidApplicationStatus(statusNum)) return;

  const newStatus = statusIndexToName(statusNum);
  const update = createStatusUpdate(
    application.status,
    application.statusSnapshots as unknown[],
    newStatus,
    event.block.number,
    event.block.timestamp * 1000,
  );

  context.Application.set({
    ...application,
    status: update.status as any,
    statusUpdatedAtBlock: update.statusUpdatedAtBlock,
    statusSnapshots: update.statusSnapshots,
  });
});

// ============================================================================
// TIMESTAMPS UPDATED
// ============================================================================

Strategy.TimestampsUpdated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const startTime = getDateFromTimestamp(event.params.startTime);
  const endTime = getDateFromTimestamp(event.params.endTime);

  // For strategies with only 2 timestamps, these are registration times
  // For DVMD, they could be allocation times depending on context
  const strategyType = getStrategyInfo(round.strategyId).type;

  if (strategyType === "dvmd") {
    // For DVMD, TimestampsUpdated with 2 params is allocation timestamps
    context.Round.set({
      ...round,
      donationsStartTime: startTime,
      donationsEndTime: endTime,
      updatedAtBlock: BigInt(event.block.number),
    });
  } else {
    // For DGLite, DGSimple, etc., these are registration timestamps
    context.Round.set({
      ...round,
      applicationsStartTime: startTime,
      applicationsEndTime: endTime,
      updatedAtBlock: BigInt(event.block.number),
    });
  }
});

Strategy.TimestampsUpdatedWithRegistrationAndAllocation.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  context.Round.set({
    ...round,
    applicationsStartTime: getDateFromTimestamp(event.params.registrationStartTime),
    applicationsEndTime: getDateFromTimestamp(event.params.registrationEndTime),
    donationsStartTime: getDateFromTimestamp(event.params.allocationStartTime),
    donationsEndTime: getDateFromTimestamp(event.params.allocationEndTime),
    updatedAtBlock: BigInt(event.block.number),
  });
});

// ============================================================================
// DISTRIBUTION UPDATED
// ============================================================================

Strategy.DistributionUpdatedWithMerkleRoot.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const metadataCid = event.params.metadata[1];
  const raw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));

  let matchingDistribution: unknown = undefined;
  if (raw) {
    const parsed = MatchingDistributionSchema.safeParse(raw);
    if (parsed.success) {
      matchingDistribution = parsed.data.matchingDistribution;
    }
  }

  context.Round.set({
    ...round,
    readyForPayoutTransaction: event.transaction.hash ?? undefined,
    matchingDistribution,
    updatedAtBlock: BigInt(event.block.number),
  });
});

Strategy.DistributionUpdated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const metadataCid = event.params.metadata[1];
  const raw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));

  let matchingDistribution: unknown = undefined;
  if (raw) {
    // Try full format first, then simple format
    const parsed = MatchingDistributionSchema.safeParse(raw);
    if (parsed.success) {
      matchingDistribution = parsed.data.matchingDistribution;
    } else {
      const simpleParsed = SimpleMatchingDistributionSchema.safeParse(raw);
      if (simpleParsed.success) {
        matchingDistribution = simpleParsed.data;
      }
    }
  }

  context.Round.set({
    ...round,
    readyForPayoutTransaction: event.transaction.hash ?? undefined,
    matchingDistribution,
    updatedAtBlock: BigInt(event.block.number),
  });
});

// ============================================================================
// UPDATED REGISTRATION
// ============================================================================

Strategy.UpdatedRegistrationWithStatus.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const recipientId = event.params.recipientId;
  const application = await findApplicationByAnchor(context, recipientId, round.id);
  if (!application) return;

  const statusNum = Number(event.params.status);
  if (!isValidApplicationStatus(statusNum)) return;

  const newStatus = statusIndexToName(statusNum);
  const update = createStatusUpdate(
    application.status,
    application.statusSnapshots as unknown[],
    newStatus,
    event.block.number,
    event.block.timestamp * 1000,
  );

  // Optionally decode updated metadata
  const data = event.params.data as Hex;
  let metadataCid = application.metadataCid;
  let metadata = application.metadata;

  try {
    const decoded = decodeDVMDExtendedApplicationData(data);
    if (decoded.metadata.pointer) {
      metadataCid = decoded.metadata.pointer;
      const raw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));
      if (raw) metadata = raw;
    }
  } catch {
    // Decoding may fail for some strategy types — keep existing metadata
  }

  context.Application.set({
    ...application,
    status: update.status as any,
    statusUpdatedAtBlock: update.statusUpdatedAtBlock,
    statusSnapshots: update.statusSnapshots,
    metadataCid,
    metadata,
  });
});

Strategy.UpdatedRegistration.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const recipientId = event.params.recipientId;
  const application = await findApplicationByAnchor(context, recipientId, round.id);
  if (!application) return;

  const data = event.params.data as Hex;
  let metadataCid = application.metadataCid;
  let metadata = application.metadata;

  try {
    const decoded = decodeDVMDExtendedApplicationData(data);
    if (decoded.metadata.pointer) {
      metadataCid = decoded.metadata.pointer;
      const raw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));
      if (raw) metadata = raw;
    }
  } catch {
    // Keep existing metadata
  }

  context.Application.set({
    ...application,
    metadataCid,
    metadata,
  });
});

Strategy.UpdatedRegistrationWithApplicationId.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const round = await findRoundByStrategy(context, event.srcAddress, chainId);
  if (!round) return;

  const appIndex = event.params.applicationId.toString();
  const poolIdBigInt = BigInt(round.id.split("_")[1]);
  const appEntityId = applicationId(chainId, poolIdBigInt, appIndex);
  const application = await context.Application.get(appEntityId);
  if (!application) return;

  const statusNum = Number(event.params.status);
  if (!isValidApplicationStatus(statusNum)) return;

  const newStatus = statusIndexToName(statusNum);
  const update = createStatusUpdate(
    application.status,
    application.statusSnapshots as unknown[],
    newStatus,
    event.block.number,
    event.block.timestamp * 1000,
  );

  const data = event.params.data as Hex;
  let metadataCid = application.metadataCid;
  let metadata = application.metadata;

  try {
    const decoded = decodeDVMDExtendedApplicationData(data);
    if (decoded.metadata.pointer) {
      metadataCid = decoded.metadata.pointer;
      const raw = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));
      if (raw) metadata = raw;
    }
  } catch {
    // Keep existing metadata
  }

  context.Application.set({
    ...application,
    status: update.status as any,
    statusUpdatedAtBlock: update.statusUpdatedAtBlock,
    statusSnapshots: update.statusSnapshots,
    metadataCid,
    metadata,
  });
});
