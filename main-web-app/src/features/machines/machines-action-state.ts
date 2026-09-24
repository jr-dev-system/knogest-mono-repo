export type MachineActionState = {
  ok: boolean;
  message: string;
  createdModel?: {
    id: string;
    name: string;
    requiresOperator: boolean;
    requiredJobRoleId: string | null;
    requiredJobRoleName: string | null;
  };
};

export function getInitialMachineActionState(): MachineActionState {
  return { ok: false, message: "" };
}
