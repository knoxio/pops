import { z } from 'zod';

export const SettingSchema = z.object({
  key: z.string(),
  value: z.string(),
});
