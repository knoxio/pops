import { sonarrProceduresCore } from './sonarr-procedures.js';
import { sonarrTestProcedures } from './sonarr-test-procedures.js';

export const sonarrProcedures = {
  ...sonarrTestProcedures,
  ...sonarrProceduresCore,
};
