/**
 * Template schema.
 *
 * Templates describe the shape of an engram type. They're declarative, stored
 * as Markdown files, and read-only at runtime — users add or change templates
 * by editing files on disk, not via API.
 */
import { z } from 'zod';

export const templateCustomFieldSchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1),
});
export type TemplateCustomField = z.infer<typeof templateCustomFieldSchema>;

export const templateFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required_fields: z.array(z.string().min(1)).optional(),
  suggested_sections: z.array(z.string().min(1)).optional(),
  default_scopes: z.array(z.string().min(1)).optional(),
  custom_fields: z.record(z.string(), templateCustomFieldSchema).optional(),
});
export type TemplateFrontmatter = z.infer<typeof templateFrontmatterSchema>;

export interface Template extends TemplateFrontmatter {
  /** Raw Markdown body — may contain `{{placeholder}}` markers. */
  body: string;
}
