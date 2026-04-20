/**
 * Corrections tRPC router - CRUD + ChangeSet operations.
 */
import { mergeRouters } from '../../../trpc.js';
import { changesetRouter } from './router-changeset.js';
import { crudRouter } from './router-crud.js';

export const correctionsRouter = mergeRouters(crudRouter, changesetRouter);
