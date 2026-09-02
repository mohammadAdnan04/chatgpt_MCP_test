import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: { url: string; description?: string }[];
  tags: { name: string; description?: string }[];
  paths: Record<string, Record<string, Operation>>;
  components?: {
    schemas?: Record<string, Schema>;
    securitySchemes?: Record<string, any>;
  };
}

export interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Schema;
}

export interface RequestBody {
  required?: boolean;
  content: Record<string, MediaType>;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema: Schema;
}

export interface Schema {
  type?: string;
  format?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: string[];
  default?: any;
  example?: any;
  description?: string;
  $ref?: string;
  nullable?: boolean;
}

export function getOpenApiSpec(): OpenApiSpec {
  const filePath = path.join(process.cwd(), 'public', 'openapi.yaml');
  const fileContents = fs.readFileSync(filePath, 'utf8');
  return yaml.parse(fileContents);
}

export function resolveRef(spec: OpenApiSpec, ref: string): Schema | undefined {
  if (!ref.startsWith('#/components/schemas/')) {
    return undefined;
  }
  const schemaName = ref.replace('#/components/schemas/', '');
  return spec.components?.schemas?.[schemaName];
}

export function resolveSchema(spec: OpenApiSpec, schema: Schema): Schema {
  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    if (resolved) {
      // Merge resolved schema with current schema overrides (like description)
      return { ...resolved, ...schema, $ref: undefined };
    }
  }
  
  if (schema.type === 'object' && schema.properties) {
    const resolvedProps: Record<string, Schema> = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      resolvedProps[key] = resolveSchema(spec, prop);
    }
    return { ...schema, properties: resolvedProps };
  }
  
  if (schema.type === 'array' && schema.items) {
    return { ...schema, items: resolveSchema(spec, schema.items) };
  }
  
  return schema;
}
