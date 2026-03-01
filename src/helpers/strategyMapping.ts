export type StrategyName =
  | "allov2.DonationVotingMerkleDistributionDirectTransferStrategy"
  | "allov2.DirectAllocationStrategy"
  | "allov2.DirectGrantsSimpleStrategy"
  | "allov2.DirectGrantsLiteStrategy"
  | "allov2.EasyRetroFundingStrategy"
  | "unknown";

export type StrategyType =
  | "dvmd"
  | "directAllocation"
  | "dgSimple"
  | "dgLite"
  | "easyRetroFunding"
  | "unknown";

const STRATEGY_MAP: Record<
  string,
  { name: StrategyName; type: StrategyType }
> = {
  "0x6f9291df02b2664139cec5703c124e4ebce32879c74b6297faa1468aa5ff9ebf": {
    name: "allov2.DonationVotingMerkleDistributionDirectTransferStrategy",
    type: "dvmd",
  },
  "0x2f46bf157821dc41daa51479e94783bb0c8699eac63bf75ec450508ab03867ce": {
    name: "allov2.DonationVotingMerkleDistributionDirectTransferStrategy",
    type: "dvmd",
  },
  "0x2f0250d534b2d59b8b5cfa5eb0d0848a59ccbf5de2eaf72d2ba4bfe73dce7c6b": {
    name: "allov2.DonationVotingMerkleDistributionDirectTransferStrategy",
    type: "dvmd",
  },
  "0x9fa6890423649187b1f0e8bf4265f0305ce99523c3d11aa36b35a54617bb0ec0": {
    name: "allov2.DonationVotingMerkleDistributionDirectTransferStrategy",
    type: "dvmd",
  },
  "0x4cd0051913234cdd7d165b208851240d334786d6e5afbb4d0eec203515a9c6f3": {
    name: "allov2.DirectAllocationStrategy",
    type: "directAllocation",
  },
  "0x263cb916541b6fc1fb5543a244829ccdba75264b097726e6ecc3c3cfce824bf5": {
    name: "allov2.DirectGrantsSimpleStrategy",
    type: "dgSimple",
  },
  "0x53fb9d3bce0956ca2db5bb1441f5ca23050cb1973b33789e04a5978acfd9ca93": {
    name: "allov2.DirectGrantsSimpleStrategy",
    type: "dgSimple",
  },
  "0x103732a8e473467a510d4128ee11065262bdd978f0d9dad89ba68f2c56127e27": {
    name: "allov2.DirectGrantsLiteStrategy",
    type: "dgLite",
  },
  "0x060ffd6c79f918819a622248c6823443412aedea610cc19c89d28dadcdef7fba": {
    name: "allov2.EasyRetroFundingStrategy",
    type: "easyRetroFunding",
  },
};

export const getStrategyInfo = (
  strategyId: string,
): { name: StrategyName; type: StrategyType } => {
  return (
    STRATEGY_MAP[strategyId.toLowerCase()] ?? {
      name: "unknown",
      type: "unknown",
    }
  );
};

export const isKnownStrategy = (strategyId: string): boolean => {
  return strategyId.toLowerCase() in STRATEGY_MAP;
};
