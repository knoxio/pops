export interface OpenApiRefSchema {
  $ref: string;
}

export type OpenApiSchema = OpenApiRefSchema | Record<string, unknown>;

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header';
  required?: boolean;
  description?: string;
  schema: OpenApiSchema;
}

export interface OpenApiRequestBody {
  required: boolean;
  content: {
    'application/json': { schema: OpenApiSchema };
  };
}

export interface OpenApiResponse {
  description: string;
  content?: {
    'application/json': { schema: OpenApiSchema };
  };
}

export interface OpenApiOperation {
  tags: string[];
  summary: string;
  operationId: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, OpenApiPathItem>;
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
}

export const refTo = (name: string): OpenApiRefSchema => ({
  $ref: `#/components/schemas/${name}`,
});
