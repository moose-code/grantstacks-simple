import { decodeAbiParameters, type Hex } from "viem";

// ABI parameter definitions
const DVMD_EVENT_DATA_DECODER = [
  { name: "data", type: "bytes" },
  { name: "recipientsCounter", type: "uint256" },
] as const;

const DVMD_DATA_DECODER = [
  { name: "registryAnchor", type: "address" },
  { name: "recipientAddress", type: "address" },
  {
    name: "metadata",
    type: "tuple",
    components: [
      { name: "protocol", type: "uint256" },
      { name: "pointer", type: "string" },
    ],
  },
] as const;

const DG_DATA_DECODER = [
  { name: "recipientId", type: "address" },
  { name: "registryAnchor", type: "address" },
  { name: "grantAmount", type: "uint256" },
  {
    name: "metadata",
    type: "tuple",
    components: [
      { name: "protocol", type: "uint256" },
      { name: "pointer", type: "string" },
    ],
  },
] as const;

// Types
export type DVMDApplicationData = {
  anchorAddress: string;
  recipientAddress: string;
  metadata: { protocol: number; pointer: string };
};

export type DVMDExtendedApplicationData = DVMDApplicationData & {
  recipientsCounter: string;
};

export type DGApplicationData = {
  recipientAddress: string;
  anchorAddress: string;
  grantAmount: bigint;
  metadata: { protocol: number; pointer: string };
};

// Functions
export const decodeDVMDApplicationData = (
  encodedData: Hex,
): DVMDApplicationData => {
  const decodedData = decodeAbiParameters(DVMD_DATA_DECODER, encodedData);
  return {
    anchorAddress: decodedData[0],
    recipientAddress: decodedData[1],
    metadata: {
      protocol: Number(decodedData[2].protocol),
      pointer: decodedData[2].pointer,
    },
  };
};

export const decodeDVMDExtendedApplicationData = (
  encodedData: Hex,
): DVMDExtendedApplicationData => {
  const values = decodeAbiParameters(DVMD_EVENT_DATA_DECODER, encodedData);
  const decodedDVMD = decodeDVMDApplicationData(values[0] as Hex);
  return {
    ...decodedDVMD,
    recipientsCounter: values[1].toString(),
  };
};

export const decodeDGApplicationData = (
  encodedData: Hex,
): DGApplicationData => {
  const decodedData = decodeAbiParameters(DG_DATA_DECODER, encodedData);
  return {
    recipientAddress: decodedData[0],
    anchorAddress: decodedData[1],
    grantAmount: decodedData[2],
    metadata: {
      protocol: Number(decodedData[3].protocol),
      pointer: decodedData[3].pointer,
    },
  };
};
