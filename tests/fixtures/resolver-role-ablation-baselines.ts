export const RESOLVER_ROLE_ABLATION_BASELINES_V1 = {
  candidate86: {
    acceptedRoleDecisionCount: 161,
    behaviorBearingDecisionCount: 18,
    geocodeCandidateCount: 130,
    modelCallCacheHitCount: 62,
    rawRoleProposalCount: 223,
    semanticHash:
      "d4be928274955c83cc1253264be4a296c94748fd62f79387b00e4c21cee33bde",
  },
  fresh87: {
    acceptedRoleDecisionCount: 113,
    behaviorBearingDecisionCount: 5,
    geocodeCandidateCount: 89,
    modelCallCacheHitCount: 60,
    rawRoleProposalCount: 150,
    semanticHash:
      "92e0a9dc7a7b5789bdd52a811f8977b76a358679212c11ec62b329cf89dee8a6",
  },
} as const;

export type ResolverRoleAblationBaselineName =
  keyof typeof RESOLVER_ROLE_ABLATION_BASELINES_V1;
