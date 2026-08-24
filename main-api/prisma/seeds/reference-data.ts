import type { PrismaClient } from "../../src/db/generated/prisma/client";

export async function seedReferenceData(_prisma: PrismaClient): Promise<void> {
  const prisma = _prisma;
  for (const unit of [
    ["00000000-0000-4000-8000-00000000a001", "L", "Litro"],
    ["00000000-0000-4000-8000-00000000a002", "UN", "Unidade"],
    ["00000000-0000-4000-8000-00000000a003", "KG", "Quilograma"],
    ["00000000-0000-4000-8000-00000000a004", "T", "Tonelada"],
    ["00000000-0000-4000-8000-00000000a005", "M3", "Metro cúbico"],
    ["00000000-0000-4000-8000-00000000a006", "H", "Hora"],
    ["00000000-0000-4000-8000-00000000a007", "M2", "Metro quadrado"],
    [
      "00000000-0000-4000-8000-00000000a008",
      "M3_KM",
      "Metro cúbico por quilômetro",
    ],
    [
      "00000000-0000-4000-8000-00000000a009",
      "M3_BANK",
      "Metro cúbico em corte",
    ],
    ["00000000-0000-4000-8000-00000000a010", "M3_LOOSE", "Metro cúbico solto"],
    [
      "00000000-0000-4000-8000-00000000a011",
      "M3_COMPACTED",
      "Metro cúbico compactado",
    ],
    [
      "00000000-0000-4000-8000-00000000a012",
      "M3_PLACED",
      "Metro cúbico aplicado",
    ],
    ["00000000-0000-4000-8000-00000000a013", "M", "Metro"],
    ["00000000-0000-4000-8000-00000000a014", "KM", "Quilômetro"],
    ["00000000-0000-4000-8000-00000000a015", "T_KM", "Tonelada-quilômetro"],
  ] as const) {
    const existingGlobalUnit = await prisma.measurementUnit.findFirst({
      where: {
        corporationId: null,
        companyId: null,
        code: unit[1],
      },
      select: { id: true },
    });

    if (existingGlobalUnit) {
      await prisma.measurementUnit.update({
        where: { id: existingGlobalUnit.id },
        data: { name: unit[2] },
      });
      continue;
    }

    await prisma.measurementUnit.upsert({
      where: { id: unit[0] },
      update: { code: unit[1], name: unit[2] },
      create: { id: unit[0], code: unit[1], name: unit[2] },
    });
  }
  await prisma.fuelType.upsert({
    where: { id: "diesel-s10" },
    update: {},
    create: { id: "diesel-s10", name: "Diesel S10" },
  });
  await prisma.fuelType.upsert({
    where: { id: "diesel-s500" },
    update: {},
    create: { id: "diesel-s500", name: "Diesel S500" },
  });
}
