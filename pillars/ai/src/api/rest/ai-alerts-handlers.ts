/**
 * Handlers for the ai-alerts contract.
 *
 * Wraps `ai-alerts/service.ts` (rule CRUD + seeding) and the
 * `ai-alerts/evaluator.ts` re-exports (`listAlerts`, `acknowledgeAlert`,
 * `runEvaluation`). When `getRule` / `acknowledgeAlert` return `null` the
 * handler throws `NotFoundError` → 404. `updateRule` / `setRuleEnabled` merge
 * the path `id` into the service input, which expects `id` in its payload.
 */
import { type AiDb } from '../../db/index.js';
import { acknowledgeAlert, listAlerts, runEvaluation } from '../modules/ai-alerts/evaluator.js';
import * as service from '../modules/ai-alerts/service.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiAlertsContract } from '../../contract/rest-ai-alerts.js';

type Req = ServerInferRequest<typeof aiAlertsContract>;

export function makeAiAlertsHandlers(db: AiDb) {
  return {
    listRules: () => runHttp(() => ({ status: 200 as const, body: service.listRules(db) })),

    seedDefaultRules: () =>
      runHttp(() => ({ status: 200 as const, body: { created: service.seedDefaultRules(db) } })),

    getRule: ({ params }: Req['getRule']) =>
      runHttp(() => {
        const rule = service.getRule(db, params.id);
        if (!rule) throw new NotFoundError('Alert rule', String(params.id));
        return { status: 200 as const, body: rule };
      }),

    createRule: ({ body }: Req['createRule']) =>
      runHttp(() => ({ status: 200 as const, body: service.createRule(db, body) })),

    updateRule: ({ params, body }: Req['updateRule']) =>
      runHttp(() => ({
        status: 200 as const,
        body: service.updateRule(db, { id: params.id, ...body }),
      })),

    setRuleEnabled: ({ params, body }: Req['setRuleEnabled']) =>
      runHttp(() => ({
        status: 200 as const,
        body: service.setRuleEnabled(db, params.id, body.enabled),
      })),

    deleteRule: ({ params }: Req['deleteRule']) =>
      runHttp(() => ({ status: 200 as const, body: service.deleteRule(db, params.id) })),

    list: ({ query }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: listAlerts(db, {
          acknowledged:
            query.acknowledged === undefined ? undefined : query.acknowledged === 'true',
          type: query.type,
          severity: query.severity,
          startDate: query.startDate,
          endDate: query.endDate,
          limit: query.limit,
          offset: query.offset,
        }),
      })),

    acknowledge: ({ params }: Req['acknowledge']) =>
      runHttp(() => {
        const alert = acknowledgeAlert(db, params.id);
        if (!alert) throw new NotFoundError('Alert', String(params.id));
        return { status: 200 as const, body: alert };
      }),

    runNow: () => runHttp(async () => ({ status: 200 as const, body: await runEvaluation(db) })),
  };
}
