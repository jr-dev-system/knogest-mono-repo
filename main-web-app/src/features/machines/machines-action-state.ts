export type MachineActionState = {
  ok: boolean;
  message: string;
  createdModel?: {
    id: string;
    name: string;
    type: "YELLOW_LINE" | "WHITE_LINE";
    requiresOperator: boolean;
    requiredJobRoleId: string | null;
    requiredJobRoleName: string | null;
  };
};

export function getInitialMachineActionState(): MachineActionState {
  return { ok: false, message: "" };
}
