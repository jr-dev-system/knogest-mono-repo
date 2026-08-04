import { describe, expect, it } from "vitest";

import { buildProjectDailyReportMessage } from "./daily-report-message";
import type { ProjectDailyReportDetail } from "./daily-reports.types";

describe("buildProjectDailyReportMessage", () => {
  it("renders the RDO sections in a stable Portuguese format", () => {
    const report = {
      id: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      reportDate: "2026-07-20",
      shift: "day",
      status: "finalized",
      project: {
        name: "Jardim das Oliveiras",
        municipality: "Imperatriz",
        state: "MA",
        contract: "Loteamento Jardins das Oliveiras I",
      },
      scheduleScale: "Seg. a Sáb.",
      supervisor: {
        employmentId: "00000000-0000-4000-8000-000000000003",
        name: "Rafael Brito",
      },
      technicalResponsibilities: [
        {
          employmentId: "00000000-0000-4000-8000-000000000004",
          name: "Hállyson",
        },
      ],
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
      activityWindow: {
        startTime: "07:00",
        endTime: "18:00",
        endDayOffset: 0,
      },
      activityTypes: ["earthworks"],
      climateConditions: ["dry"],
      rainfall: { dailyMm: "0.00", monthlyMm: "0.00" },
      employees: [
        {
          employmentId: "00000000-0000-4000-8000-000000000003",
          name: "Rafael Brito",
          jobRole: "Supervisor de Terraplanagem",
          completedFullShift: true,
          regularWorkedMinutes: 600,
          overtimeMinutes: 60,
        },
      ],
      machines: [
        {
          machineId: "00000000-0000-4000-8000-000000000005",
          name: "EH-01 Hyundai",
          manufacturer: "Hyundai",
          model: "R220",
          meterType: "hour_meter",
          identifier: null,
          startMeterReading: {
            id: "00000000-0000-4000-8000-000000000006",
            value: "2168.10",
          },
          endMeterReading: {
            id: "00000000-0000-4000-8000-000000000007",
            value: "2174.60",
          },
        },
      ],
      executedActivities: "Transporte de material para a área do açude.",
      interferences: null,
      createdBy: {
        id: "00000000-0000-4000-8000-000000000008",
        email: "master@example.com",
      },
      finalizedBy: {
        id: "00000000-0000-4000-8000-000000000008",
        email: "master@example.com",
      },
      finalizedAt: "2026-07-20T21:00:00.000Z",
      createdAt: "2026-07-20T21:00:00.000Z",
      updatedAt: "2026-07-20T21:00:00.000Z",
    } satisfies ProjectDailyReportDetail;

    expect(buildProjectDailyReportMessage(report))
      .toBe(`Relatório Terraplanagem – RDO
Informações Analíticas – 20/07/2026

🏡 Jardim das Oliveiras
👤 Supervisor: Rafael Brito
👤 Técnico Eng.: Hállyson
📍 Município: Imperatriz–MA
📑 Contrato: Loteamento Jardins das Oliveiras I
🕘 Turno: Diurno

⏰ Horário Padrão
07:00 às 12:00
13:00 às 18:00
Escala: Seg. a Sáb.

( X ) Terraplanagem
(   ) Drenagem
(   ) Pavimentação

🌤️ Clima
(   ) Chuva
( X ) Seco
(   ) Solo Encharcado

🌦️ Índice Pluviométrico: 0,00 mm
Total acumulado no mês: 0,00 mm

👷🏽‍♂️ Mão de obra
01 Supervisor de Terraplanagem

🧾 Jornada individual
Rafael Brito — Supervisor de Terraplanagem: 10:00 normais, turno completo, 01:00 extras

🚜 Equipamentos
01 EH-01 Hyundai

⛽ Abastecimento das máquinas
Não informado

⏱️ Horímetro das máquinas

🕰️ EH-01 Hyundai — R220
Início: 2.168,10
Final: 2.174,60

🚧 Atividades Executadas
Transporte de material para a área do açude.

⚠️ Interferências
Nenhuma interferência registrada

Encerramento das atividades
Início 07:00
Final 18:00

Segunda-feira 20/07/2026.`);
  });
});
