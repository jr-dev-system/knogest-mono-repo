import type { HandlerContext } from "../../lib/utils/handler.dto";
import {
  ProjectsHandler,
  type ProjectScope,
} from "./handlers/projects.handler";
import type {
  ProjectCommand,
  ProjectEmployeeMobilizationCommand,
  ProjectListQuery,
  ProjectMachineMobilizationCommand,
  ProjectMobilizationHistoryQuery,
  ProjectReadinessCommand,
  ProjectTeamCandidatesQuery,
  ProjectTeamMembersQuery,
  ProjectQuantityBaselineRevisionCommand,
  ProjectWorkFrontCommand,
  ProjectWorkFrontMobilizationCommand,
  ProjectWorkFrontMobilizationOptionsQuery,
  ProjectWorkFrontServicesCommand,
} from "./projects.dto";

export type { ProjectScope } from "./handlers/projects.handler";

export class ProjectsService {
  private readonly handler: ProjectsHandler;

  constructor(context: HandlerContext) {
    this.handler = new ProjectsHandler(context);
  }

  finalize(
    scope: ProjectScope,
    expectedCompanyId: string,
    key: string,
    command: ProjectCommand,
  ) {
    return this.handler.finalize(scope, expectedCompanyId, key, command);
  }

  list(scope: ProjectScope, query: ProjectListQuery) {
    return this.handler.list(scope, query);
  }

  detail(scope: ProjectScope, projectId: string) {
    return this.handler.detail(scope, projectId);
  }

  readinessOptions(scope: ProjectScope, projectId: string) {
    return this.handler.readinessOptions(scope, projectId);
  }

  teamCandidates(
    scope: ProjectScope,
    projectId: string,
    query: ProjectTeamCandidatesQuery,
  ) {
    return this.handler.teamCandidates(scope, projectId, query);
  }

  teamMembers(
    scope: ProjectScope,
    projectId: string,
    query: ProjectTeamMembersQuery,
  ) {
    return this.handler.teamMembers(scope, projectId, query);
  }

  saveReadiness(
    scope: ProjectScope,
    projectId: string,
    command: ProjectReadinessCommand,
  ) {
    return this.handler.saveReadiness(scope, projectId, command);
  }

  saveQuantityBaseline(
    scope: ProjectScope,
    projectId: string,
    command: ProjectQuantityBaselineRevisionCommand,
  ) {
    return this.handler.saveQuantityBaseline(scope, projectId, command);
  }

  createWorkFront(
    scope: ProjectScope,
    projectId: string,
    command: ProjectWorkFrontCommand,
  ) {
    return this.handler.createWorkFront(scope, projectId, command);
  }

  updateWorkFront(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
    command: ProjectWorkFrontCommand,
  ) {
    return this.handler.updateWorkFront(scope, projectId, frontId, command);
  }

  saveWorkFrontServices(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
    command: ProjectWorkFrontServicesCommand,
  ) {
    return this.handler.saveWorkFrontServices(
      scope,
      projectId,
      frontId,
      command,
    );
  }

  saveWorkFrontMobilization(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
    command: ProjectWorkFrontMobilizationCommand,
  ) {
    return this.handler.saveWorkFrontMobilization(
      scope,
      projectId,
      frontId,
      command,
    );
  }

  workFrontMobilizationOptions(
    scope: ProjectScope,
    projectId: string,
    frontId: string,
    query: ProjectWorkFrontMobilizationOptionsQuery,
  ) {
    return this.handler.workFrontMobilizationOptions(
      scope,
      projectId,
      frontId,
      query,
    );
  }

  saveEmployeeMobilization(
    scope: ProjectScope,
    projectId: string,
    command: ProjectEmployeeMobilizationCommand,
  ) {
    return this.handler.saveEmployeeMobilization(scope, projectId, command);
  }

  saveEmployeeMobilizationShift(
    scope: ProjectScope,
    projectId: string,
    shift: "day" | "night",
    command: ProjectEmployeeMobilizationCommand,
  ) {
    return this.handler.saveEmployeeMobilizationShift(
      scope,
      projectId,
      shift,
      command,
    );
  }

  saveMachineMobilization(
    scope: ProjectScope,
    projectId: string,
    command: ProjectMachineMobilizationCommand,
  ) {
    return this.handler.saveMachineMobilization(scope, projectId, command);
  }

  mobilizationHistory(
    scope: ProjectScope,
    projectId: string,
    query: ProjectMobilizationHistoryQuery,
  ) {
    return this.handler.mobilizationHistory(scope, projectId, query);
  }

  startWorkFront(scope: ProjectScope, projectId: string, frontId: string) {
    return this.handler.startWorkFront(scope, projectId, frontId);
  }

  cancelWorkFront(scope: ProjectScope, projectId: string, frontId: string) {
    return this.handler.cancelWorkFront(scope, projectId, frontId);
  }

  activate(scope: ProjectScope, projectId: string) {
    return this.handler.activate(scope, projectId);
  }
}
