export type MachineAllocationProjectOption = {
  id: string;
  name: string;
  contractNumber: string | null;
  status: "planned" | "active";
};

export type MachineAllocationProjectPage = {
  data: MachineAllocationProjectOption[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type MachineAllocationProjectContext = {
  id: string;
  name: string;
  status: "planned" | "active";
  shifts: ("day" | "night")[];
  operators: {
    employmentId: string;
    name: string;
    jobRole: string;
    confirmedJobRoleId: string | null;
    shift: "day" | "night";
  }[];
};

export type MachineAllocationProjectsResult =
  | { ok: true; page: MachineAllocationProjectPage }
  | { ok: false; message: string };

export type MachineAllocationProjectContextResult =
  | { ok: true; project: MachineAllocationProjectContext }
  | { ok: false; message: string };
