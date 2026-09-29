export type MachineUnitBatchDraft = {
  projectId: string;
  units: Array<{
    name?: string;
    plate?: string;
    companyTag?: string;
    meterType: "HOUR_METER" | "ODOMETER";
    initialMeterReading: string;
    hourlyRate?: string;
    loadCapacity?: string;
    loadCapacityUnitCode?:
      | "M3_LOOSE"
      | "M3_COMPACTED"
      | "LITER"
      | "CUBIC_YARD";
    maxSupportedWeightT?: string;
    allocation: {
      projectId: string;
      operatorAssignments: Array<{
        shift: "day" | "night";
        operatorEmploymentId: string;
      }>;
    };
  }>;
};

export type MachineUnitBatchActionResult =
  | {
      ok: true;
      createdCount: number;
      rejected: Array<{ index: number; code: string; message: string }>;
      message: string;
    }
  | { ok: false; message: string };
