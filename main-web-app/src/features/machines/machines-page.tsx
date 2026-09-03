import { createMachineModelAction } from "./machines.actions";
import {
  getMachineModelsList,
  parseMachinesSearchParams,
} from "./machines.server";
import { getJobRoles } from "../employees/employees.server";
import { MachinesPageView } from "./components/machines-page";

export async function MachinesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = parseMachinesSearchParams(searchParams);
  const [page, jobRoles] = await Promise.all([
    getMachineModelsList(query),
    getJobRoles(),
  ]);
  return (
    <MachinesPageView
      action={createMachineModelAction}
      pageInfo={page.pageInfo}
      query={query}
      rows={page.data}
      jobRoles={(jobRoles ?? []).filter((role) => role.isActive)}
    />
  );
}
