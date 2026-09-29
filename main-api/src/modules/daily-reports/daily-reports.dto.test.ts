import { describe, expect, it } from "vitest";

import {
  dailyReportCommandSchema,
  operationalShiftCloseSchema,
  operationalShiftStartSchema,
} from "./daily-reports.dto";

const id = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function validCommand() {
  return {
    reportDate: "2026-07-20",
    shift: "day",
    schedulePeriods: [
      {
        startTime: "07:00",
        endTime: "12:00",
        startDayOffset: 0,
        endDayOffset: 0,
      },
      {
        startTime: "13:00",
        endTime: "18:00",
        startDayOffset: 0,
        endDayOffset: 0,
      },
    ],
    activityStartTime: "07:00",
    activityEndTime: "18:00",
    activityEndDayOffset: 0,
    activityTypes: ["earthworks"],
    climateConditions: ["dry"],
    dailyRainfallMm: "0",
    monthlyRainfallMm: "0.00",
    supervisorEmploymentId: id("1"),
    technicalResponsibilityEmploymentIds: [id("2")],
    employees: [
      {
        employmentId: id("1"),
        completedFullShift: true,
        regularWorkedMinutes: 600,
        overtimeMinutes: 60,
      },
    ],
    machines: [{ machineId: id("3"), endMeterReadingValue: "2174.60" }],
    executedActivities: "Transporte e compactação de material.",
    interferences: null,
  } as const;
}

describe("dailyReportCommandSchema", () => {
  it("accepts an ordered day shift split into schedule periods", () => {
    expect(dailyReportCommandSchema.safeParse(validCommand()).success).toBe(
      true,
    );
  });

  it("accepts a night shift whose end belongs to the next day", () => {
    const result = dailyReportCommandSchema.safeParse({
      ...validCommand(),
      shift: "night",
      schedulePeriods: [
        {
          startTime: "18:00",
          endTime: "06:00",
          startDayOffset: 0,
          endDayOffset: 1,
        },
      ],
      activityStartTime: "18:00",
      activityEndTime: "06:00",
      activityEndDayOffset: 1,
    });
    expect(result.success).toBe(true);
  });

  it("infers the next day when a night shift closes before its start", () => {
    const result = dailyReportCommandSchema.safeParse({
      ...validCommand(),
      shift: "night",
      schedulePeriods: [
        {
          startTime: "18:00",
          endTime: "06:00",
          startDayOffset: 0,
          endDayOffset: 1,
        },
      ],
      activityStartTime: "18:00",
      activityEndTime: "06:00",
      activityEndDayOffset: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.activityEndDayOffset).toBe(1);
  });

  it("rejects standard or actual windows longer than 24 hours", () => {
    const result = dailyReportCommandSchema.safeParse({
      ...validCommand(),
      shift: "night",
      schedulePeriods: [
        {
          startTime: "01:00",
          endTime: "02:00",
          startDayOffset: 0,
          endDayOffset: 1,
        },
      ],
      activityStartTime: "01:00",
      activityEndTime: "02:00",
      activityEndDayOffset: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects overlapping or unordered standard schedule periods", () => {
    const result = dailyReportCommandSchema.safeParse({
      ...validCommand(),
      schedulePeriods: [
        {
          startTime: "13:00",
          endTime: "18:00",
          startDayOffset: 0,
          endDayOffset: 0,
        },
        {
          startTime: "07:00",
          endTime: "14:00",
          startDayOffset: 0,
          endDayOffset: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate resources and empty participant time", () => {
    const result = dailyReportCommandSchema.safeParse({
      ...validCommand(),
      employees: [
        {
          employmentId: id("1"),
          completedFullShift: false,
          regularWorkedMinutes: 0,
          overtimeMinutes: 0,
        },
        {
          employmentId: id("1"),
          completedFullShift: true,
          regularWorkedMinutes: 480,
          overtimeMinutes: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a day shift that ends on the next civil day", () => {
    const result = dailyReportCommandSchema.safeParse({
      ...validCommand(),
      activityEndDayOffset: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("operational shift commands", () => {
  it("accepts complete start checklists", () => {
    expect(
      operationalShiftStartSchema.safeParse({
        startedAt: "2026-09-24T11:00:00.000Z",
        employees: [
          { employmentId: id("1"), status: "present", absenceReason: null },
          {
            employmentId: id("2"),
            status: "absent",
            absenceReason: "Atestado",
          },
        ],
        machines: [
          { machineId: id("3"), condition: "fit", conditionNote: null },
          {
            machineId: id("4"),
            condition: "unfit",
            conditionNote: "Em manutenção",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects an unfit machine without its condition note", () => {
    const result = operationalShiftStartSchema.safeParse({
      startedAt: "2026-09-24T11:00:00.000Z",
      employees: [
        { employmentId: id("1"), status: "present", absenceReason: null },
      ],
      machines: [
        { machineId: id("3"), condition: "unfit", conditionNote: null },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts employee hours, intervals and machine readings at close", () => {
    expect(
      operationalShiftCloseSchema.safeParse({
        endedAt: "2026-09-24T20:00:00.000Z",
        earlyClosureReason: null,
        employees: [
          {
            employmentId: id("1"),
            checkInAt: "2026-09-24T11:00:00.000Z",
            checkOutAt: "2026-09-24T20:00:00.000Z",
            breaks: [
              {
                startAt: "2026-09-24T15:00:00.000Z",
                endAt: "2026-09-24T16:00:00.000Z",
              },
            ],
            overtimeConfirmed: true,
          },
        ],
        machines: [{ machineId: id("3"), endMeterReadingValue: "2190.25" }],
      }).success,
    ).toBe(true);
  });

  it("accepts automatic hours for an employee with overtime disabled", () => {
    expect(
      operationalShiftCloseSchema.safeParse({
        endedAt: "2026-09-24T20:00:00.000Z",
        earlyClosureReason: null,
        employees: [
          {
            employmentId: id("1"),
            checkInAt: null,
            checkOutAt: null,
            breaks: [
              {
                startAt: "2026-09-24T15:00:00.000Z",
                endAt: "2026-09-24T16:00:00.000Z",
              },
            ],
            overtimeConfirmed: false,
          },
        ],
        machines: [],
      }).success,
    ).toBe(true);
  });
});
