/**
 * REST contract for the core pillar — ts-rest single source of truth.
 *
 * Composes the migrated domain sub-routers into the public wire surface.
 * `generateOpenApi(coreContract, …)` projects this to
 * `openapi/core.openapi.json`; `openapi-typescript` then projects the JSON
 * to `src/contract/api-types.generated.ts`.
 *
 * This is the ts-rest surface that runs ALONGSIDE the legacy tRPC router
 * (mounted at `/trpc`) during the core REST migration. It starts with the
 * `entities` domain and grows as each tRPC slice converts. The tRPC router
 * is the SSoT for everything not yet listed here.
 */
import { initContract } from '@ts-rest/core';

import { coreAiAlertsContract } from './rest-ai-alerts.js';
import { coreAiBudgetsContract } from './rest-ai-budgets.js';
import { coreAiObservabilityContract } from './rest-ai-observability.js';
import { coreAiProvidersContract } from './rest-ai-providers.js';
import { coreAiUsageContract } from './rest-ai-usage.js';
import { coreEntitiesContract } from './rest-entities.js';
import { coreSearchContract } from './rest-search.js';
import { coreServiceAccountsContract } from './rest-service-accounts.js';
import { coreSettingsContract } from './rest-settings.js';
import { coreShellContract } from './rest-shell.js';
import { coreUsersContract } from './rest-users.js';

const c = initContract();

export const coreContract = c.router(
  {
    aiAlerts: coreAiAlertsContract,
    aiBudgets: coreAiBudgetsContract,
    aiObservability: coreAiObservabilityContract,
    aiProviders: coreAiProvidersContract,
    aiUsage: coreAiUsageContract,
    entities: coreEntitiesContract,
    search: coreSearchContract,
    serviceAccounts: coreServiceAccountsContract,
    settings: coreSettingsContract,
    shell: coreShellContract,
    users: coreUsersContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type CoreRestContract = typeof coreContract;
