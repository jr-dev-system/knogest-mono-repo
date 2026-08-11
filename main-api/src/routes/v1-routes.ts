import { v1AuthController } from "../modules/auth/auth.controller";
import { v1CommercialController } from "../modules/commercial/commercial.controller";
import { v1FleetController } from "../modules/fleet/fleet.controller";
import { v1WorkforceController } from "../modules/workforce/workforce.controller";
import { v1ProjectsController } from "../modules/projects/projects.controller";
import { v1DailyReportsController } from "../modules/daily-reports/daily-reports.controller";
import { v1ProductionsController } from "../modules/productions/productions.controller";
import { v1EarthworkCatalogsController } from "../modules/earthwork-catalogs/earthwork-catalogs.controller";
import { FastifyInstance } from "fastify";

export const v1Routes = (app: FastifyInstance) => {
  app.register(v1AuthController, { prefix: "/auth" });
  app.register(v1CommercialController);
  app.register(v1FleetController);
  app.register(v1WorkforceController);
  app.register(v1ProjectsController);
  app.register(v1DailyReportsController);
  app.register(v1ProductionsController);
  app.register(v1EarthworkCatalogsController);
};
