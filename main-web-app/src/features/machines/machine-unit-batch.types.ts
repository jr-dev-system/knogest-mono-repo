export type MachineUnitBatchDraft = {
  projectId: string;
  units: Array<{
    name?: string;
    plate?: string;
    companyTag?: string;
    meterType: "HOUR_METER" | "ODOMETER";
    initialMeterReading: string;
    ownership:
      | { kind: "OWNED" }
      | {
          kind: "RENTED";
          lessorName: string;
          suggestedHourlyRate: string;
        };
    allocation: {
      projectId: string;
      confirmedHourlyRate?: string;
      monthlyHours?: number;
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
