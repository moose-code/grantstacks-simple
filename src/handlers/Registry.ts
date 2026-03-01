import { Registry } from "generated";
import { getAddress } from "viem";
import { projectId, projectRoleId, pendingProjectRoleId } from "../helpers/ids.js";
import { ipfsMetadataEffect, parseIpfsResult } from "../effects/ipfsMetadata.js";
import { ProjectMetadataSchema } from "../schemas/projectMetadata.js";

const ALLO_OWNER_ROLE = "0x815b5a78dc333d344c7df9da23c04dbd432015cc701876ddb9ffe850e6882747";

Registry.ProfileCreated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const profileId = event.params.profileId;
  const metadataCid = event.params.metadata[1];

  const metadata = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));

  let projectType: "canonical" | "linked" | "program" = "canonical";
  let parsedMetadata: unknown = metadata;

  if (metadata) {
    const parsed = ProjectMetadataSchema.safeParse(metadata);
    if (parsed.success) {
      parsedMetadata = parsed.data;
      if (parsed.data.type === "program") {
        projectType = "program";
      } else if ("canonical" in parsed.data) {
        projectType = "linked";
      }
    }
  }

  const id = projectId(chainId, profileId);
  const registryAddress = getAddress(event.srcAddress);

  context.Project.set({
    id,
    name: event.params.name,
    nonce: BigInt(event.params.nonce),
    anchorAddress: getAddress(event.params.anchor),
    chainId,
    projectNumber: undefined,
    registryAddress,
    metadataCid: metadataCid || undefined,
    metadata: parsedMetadata,
    createdByAddress: getAddress(event.params.owner),
    createdAtBlock: BigInt(event.block.number),
    updatedAtBlock: BigInt(event.block.number),
    tags: [`allo-v2`, `registry-${registryAddress}`],
    projectType,
    timestamp: new Date(event.block.timestamp * 1000).toISOString(),
  });

  // Create owner role
  const ownerRoleEntityId = projectRoleId(chainId, id, "owner", event.params.owner);
  context.ProjectRole.set({
    id: ownerRoleEntityId,
    chainId,
    project_id: id,
    address: getAddress(event.params.owner),
    role: "owner",
    createdAtBlock: BigInt(event.block.number),
  });

  // Convert pending project roles
  const pendingRoles = await context.PendingProjectRole.getWhere({ role: { _eq: profileId } });
  for (const pending of pendingRoles) {
    if (pending.chainId !== chainId) continue;

    const memberRoleId = projectRoleId(chainId, id, "member", pending.address);
    context.ProjectRole.set({
      id: memberRoleId,
      chainId,
      project_id: id,
      address: pending.address,
      role: "member",
      createdAtBlock: pending.createdAtBlock,
    });

    context.PendingProjectRole.deleteUnsafe(pending.id);
  }
});

Registry.ProfileMetadataUpdated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const id = projectId(chainId, event.params.profileId);
  const existing = await context.Project.get(id);
  if (!existing) return;

  const metadataCid = event.params.metadata[1];
  const metadata = parseIpfsResult(await context.effect(ipfsMetadataEffect, metadataCid));

  let projectType = existing.projectType;
  let parsedMetadata: unknown = metadata;

  if (metadata) {
    const parsed = ProjectMetadataSchema.safeParse(metadata);
    if (parsed.success) {
      parsedMetadata = parsed.data;
      if (parsed.data.type === "program") {
        projectType = "program";
      } else if ("canonical" in parsed.data) {
        projectType = "linked";
      } else {
        projectType = "canonical";
      }
    }
  }

  context.Project.set({
    ...existing,
    metadataCid: metadataCid || undefined,
    metadata: parsedMetadata,
    projectType,
    updatedAtBlock: BigInt(event.block.number),
  });
});

Registry.ProfileNameUpdated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const id = projectId(chainId, event.params.profileId);
  const existing = await context.Project.get(id);
  if (!existing) return;

  context.Project.set({
    ...existing,
    name: event.params.name,
    anchorAddress: getAddress(event.params.anchor),
    updatedAtBlock: BigInt(event.block.number),
  });
});

Registry.ProfileOwnerUpdated.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const id = projectId(chainId, event.params.profileId);
  const existing = await context.Project.get(id);
  if (!existing) return;

  // Delete all existing owner roles for this project
  const existingRoles = await context.ProjectRole.getWhere({ project_id: { _eq: id } });
  for (const role of existingRoles) {
    if (role.role === "owner") {
      context.ProjectRole.deleteUnsafe(role.id);
    }
  }

  // Create new owner role
  const newOwner = getAddress(event.params.owner);
  const ownerRoleEntityId = projectRoleId(chainId, id, "owner", newOwner);
  context.ProjectRole.set({
    id: ownerRoleEntityId,
    chainId,
    project_id: id,
    address: newOwner,
    role: "owner",
    createdAtBlock: BigInt(event.block.number),
  });
});

Registry.RegistryRoleGranted.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const role = event.params.role;

  if (role.toLowerCase() === ALLO_OWNER_ROLE.toLowerCase()) return;

  const account = getAddress(event.params.account);

  const id = projectId(chainId, role);
  const project = await context.Project.get(id);

  if (project) {
    const memberRoleId = projectRoleId(chainId, id, "member", account);
    context.ProjectRole.set({
      id: memberRoleId,
      chainId,
      project_id: id,
      address: account,
      role: "member",
      createdAtBlock: BigInt(event.block.number),
    });
  } else {
    const pendingId = pendingProjectRoleId(chainId, role, account);
    context.PendingProjectRole.set({
      id: pendingId,
      chainId,
      role,
      address: account,
      createdAtBlock: BigInt(event.block.number),
    });
  }
});

Registry.RegistryRoleRevoked.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const role = event.params.role;

  if (role.toLowerCase() === ALLO_OWNER_ROLE.toLowerCase()) return;

  const account = getAddress(event.params.account);
  const id = projectId(chainId, role);

  const memberRoleId = projectRoleId(chainId, id, "member", account);
  context.ProjectRole.deleteUnsafe(memberRoleId);
});
