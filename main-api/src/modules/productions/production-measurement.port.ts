export type ProductionMeasurementCandidate = {
  productionId: string;
  componentId: string;
  revision: number;
  value: string;
  unitCode: string;
  volumeCondition: "bank" | "loose" | "compacted" | "placed" | null;
  releasedAt: string;
};

/**
 * Boundary for the future commercial measurement module. Implementations may
 * read released technical quantities, but must never mutate operational or
 * estimated production records.
 */
export interface ProductionMeasurementPort {
  listReleasedCandidates(input: {
    corporationId: string;
    companyId: string;
    projectId: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    data: ProductionMeasurementCandidate[];
    pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  }>;
}
