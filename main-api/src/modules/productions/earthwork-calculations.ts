export type TruckSummaryCalculationInput = {
  capacity: string;
  acceptedTrips: number;
  partialTripCount: number;
  partialVolume: string;
  loadFactor: string;
  actualWeightT: string | null;
};

export type EarthworkMovementCalculationInput = {
  trucks: TruckSummaryCalculationInput[];
  densityTPerM3: string | null;
  swellFactor: string | null;
  looseToCompactedFactor: string | null;
  contractualDmtKm: string | null;
};

export function calculateTruckSummaryVolume(
  input: TruckSummaryCalculationInput,
): string {
  const fullTrips = input.acceptedTrips - input.partialTripCount;
  if (fullTrips < 0) throw new Error("Partial trips exceed accepted trips");
  const capacity = decimalToScaled(input.capacity, 3);
  const loadFactor = decimalToScaled(input.loadFactor, 6);
  const fullVolume = divideRounded(
    capacity * loadFactor * BigInt(fullTrips),
    pow10(6),
  );
  const partialVolume = decimalToScaled(input.partialVolume, 3);
  return scaledToDecimal(fullVolume + partialVolume, 3);
}

export function calculateEarthworkMovement(
  input: EarthworkMovementCalculationInput,
) {
  const looseVolume = input.trucks.reduce(
    (sum, truck) =>
      sum + decimalToScaled(calculateTruckSummaryVolume(truck), 3),
    BigInt(0),
  );
  const actualWeightT = input.trucks.reduce(
    (sum, truck) =>
      sum +
      (truck.actualWeightT
        ? decimalToScaled(truck.actualWeightT, 3)
        : BigInt(0)),
    BigInt(0),
  );
  const convertedLooseVolume =
    actualWeightT > BigInt(0) && input.densityTPerM3
      ? divideScaled(actualWeightT, decimalToScaled(input.densityTPerM3, 6), 6)
      : actualWeightT > BigInt(0)
        ? null
        : looseVolume;
  const bankVolume =
    input.swellFactor && convertedLooseVolume !== null
      ? divideScaled(
          convertedLooseVolume,
          decimalToScaled(input.swellFactor, 6),
          6,
        )
      : null;
  const compactedVolume =
    input.looseToCompactedFactor && convertedLooseVolume !== null
      ? multiplyScaled(
          convertedLooseVolume,
          decimalToScaled(input.looseToCompactedFactor, 6),
          6,
        )
      : null;
  const transportBase = actualWeightT > BigInt(0) ? actualWeightT : looseVolume;
  const transportMoment = input.contractualDmtKm
    ? multiplyScaled(
        transportBase,
        decimalToScaled(input.contractualDmtKm, 3),
        3,
      )
    : null;
  return {
    looseVolumeM3: scaledToDecimal(looseVolume, 3),
    actualWeightT:
      actualWeightT > BigInt(0) ? scaledToDecimal(actualWeightT, 3) : null,
    estimatedBankVolumeM3:
      bankVolume === null ? null : scaledToDecimal(bankVolume, 3),
    estimatedCompactedVolumeM3:
      compactedVolume === null ? null : scaledToDecimal(compactedVolume, 3),
    transportMoment:
      transportMoment === null ? null : scaledToDecimal(transportMoment, 3),
    transportMomentUnit:
      actualWeightT > BigInt(0) ? ("T_KM" as const) : ("M3_KM" as const),
  };
}

export function decimalToScaled(value: string, scale: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match) throw new Error("Invalid non-negative decimal");
  const decimals = match[2] ?? "";
  const padded = `${decimals}${"0".repeat(scale)}`;
  const kept = padded.slice(0, scale);
  const discarded = padded.slice(scale);
  let scaled = BigInt(match[1]) * pow10(scale) + BigInt(kept || "0");
  if (discarded[0] && Number(discarded[0]) >= 5) scaled += BigInt(1);
  return scaled;
}

function multiplyScaled(left: bigint, right: bigint, rightScale: number) {
  return divideRounded(left * right, pow10(rightScale));
}

function divideScaled(value: bigint, divisor: bigint, divisorScale: number) {
  if (divisor === BigInt(0)) throw new Error("Division by zero");
  return divideRounded(value * pow10(divisorScale), divisor);
}

function divideRounded(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;
}

function pow10(scale: number) {
  return BigInt(10) ** BigInt(scale);
}

function scaledToDecimal(value: bigint, scale: number) {
  const base = pow10(scale);
  return `${value / base}.${(value % base).toString().padStart(scale, "0")}`;
}
