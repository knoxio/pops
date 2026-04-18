/**
 * tRPC router for cerebrum.templates.
 *
 * Templates are read-only at runtime — the operator edits `.md` files
 * directly on disk. The router exposes list/get for UIs that let the user
 * pick a template when creating an engram.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { getTemplateRegistry } from '../instance.js';

export const templatesRouter = router({
  list: protectedProcedure.query(() => {
    const templates = getTemplateRegistry()
      .list()
      .map(({ body: _body, ...rest }) => rest);
    return { templates };
  }),

  get: protectedProcedure.input(z.object({ name: z.string().min(1) })).query(({ input }) => {
    const template = getTemplateRegistry().get(input.name);
    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Template '${input.name}' not found` });
    }
    return { template };
  }),
});
