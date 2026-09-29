export type OperationalShift = "day" | "night";

export type OperationalEmployee = {
  employmentId: string;
  name: string;
  jobRole: string;
  overtimeEnabled?: boolean;
  attendanceStatus?: "present" | "absent";
  absenceReason?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  overtimeConfirmed?: boolean;
  regularWorkedMinutes?: number;
  overtimeMinutes?: number;
  breaks?: Array<{ startAt: string; endAt: string }>;
};

export type OperationalMachine = {
  machineId: string;
  name: string;
  manufacturer: string;
  model: string;
  meterType: "hour_meter" | "odometer";
  startMeterReading: { id: string; value: string };
  endMeterReading?: { id: string | null; value: string };
  operationalCondition?: "fit" | "unfit";
  conditionNote?: string | null;
};

export type OperationalReport = {
  id: string;
  status: "draft" | "finalized";
  shift: OperationalShift;
  startedAt: string | null;
  finalizedAt: string | null;
  activityWindow: { startTime: string; endTime: string; endDayOffset: number };
  schedulePeriods: Array<{
    startTime: string;
    endTime: string;
    startDayOffset: number;
    endDayOffset: number;
  }>;
  supervisor: { employmentId: string; name: string };
  technicalResponsibilities: Array<{ employmentId: string; name: string }>;
  activityTypes: string[];
  climateConditions: string[];
  rainfall: { dailyMm: string; monthlyMm: string };
  executedActivities: string;
  employees: OperationalEmployee[];
  machines: OperationalMachine[];
  interferenceEntries: Array<{
    id: string;
    category: string;
    description: string;
    impact: string;
    startedAt: string;
    endedAt: string | null;
    confirmedAt: string | null;
  }>;
};

export type OperationalOptions = {
  defaults: {
    schedulePeriods: OperationalReport["schedulePeriods"];
    activityStartTime: string;
    activityEndTime: string;
    activityEndDayOffset: number;
    supervisorEmploymentId: string | null;
    technicalResponsibilityEmploymentIds: string[];
  };
  responsibleOptions: Array<{ id: string; name: string }>;
  employeeOptions: Array<{
    id: string;
    name: string;
    jobRole: string;
    overtimeEnabled: boolean;
  }>;
  machineOptions: Array<{
    id: string;
    name: string;
    manufacturer: string;
    model: string;
    meterType: "hour_meter" | "odometer";
    startMeterReading: { id: string; value: string };
  }>;
};

export type OperationalDay = {
  reportDate: string;
  shifts: Array<{
    shift: OperationalShift;
    enabled: boolean;
    suggestedStartedAt: string | null;
    options: OperationalOptions | null;
    report: OperationalReport | null;
  }>;
};

export type OperationalResult =
  | { kind: "success"; day: OperationalDay }
  | { kind: "failure"; message: string };
