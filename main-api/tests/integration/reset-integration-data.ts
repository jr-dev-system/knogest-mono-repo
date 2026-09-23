import type { PrismaClient } from "../../src/db/generated/prisma/client";

export async function resetIntegrationData(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "projects" CASCADE');
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "machine_meter_reading_references" CASCADE',
  );
  await prisma.machineMeterReadingCorrection.deleteMany();
  await prisma.machineMeterReading.deleteMany();
  await prisma.machineIdentifier.deleteMany();
  await prisma.machineOwnershipPeriod.deleteMany();
  await prisma.machine.deleteMany();
  await prisma.machineModel.deleteMany();
  await prisma.employmentJobRolePeriod.deleteMany();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "employment_periods" CASCADE');
  await prisma.employment.deleteMany();
  await prisma.jobRole.deleteMany();
  await prisma.person.deleteMany();
  await prisma.supplierOfferPrice.deleteMany();
  await prisma.supplierOffer.deleteMany();
  await prisma.suppliedItem.deleteMany();
  await prisma.suppliedItemCategory.deleteMany();
  await prisma.fuelSupplier.deleteMany();
  await prisma.client.deleteMany();
  await prisma.sensitiveDocumentProtectionHarness.deleteMany();
  await prisma.fuelType.deleteMany();
  await prisma.measurementUnit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.corporation.deleteMany();
  await prisma.measurementUnit.createMany({
    data: [
      {
        id: "00000000-0000-4000-8000-00000000a001",
        code: "L",
        name: "Litro",
      },
      {
        id: "00000000-0000-4000-8000-00000000a002",
        code: "UN",
        name: "Unidade",
      },
      {
        id: "00000000-0000-4000-8000-00000000a003",
        code: "KG",
        name: "Quilograma",
      },
      {
        id: "00000000-0000-4000-8000-00000000a004",
        code: "T",
        name: "Tonelada",
      },
      {
        id: "00000000-0000-4000-8000-00000000a005",
        code: "M3",
        name: "Metro cúbico",
      },
      {
        id: "00000000-0000-4000-8000-00000000a006",
        code: "H",
        name: "Hora",
      },
    ],
  });
}
