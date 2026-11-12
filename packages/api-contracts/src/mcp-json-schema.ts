import { z } from "./schemas";

export type McpJsonSchema = Record<string, unknown>;

const namedSchemaMapKeys = new Set(["$defs", "definitions", "dependentSchemas", "dependencies", "patternProperties", "properties"]);
const schemaValueKeys = new Set([
  "additionalProperties", "unevaluatedProperties", "propertyNames", "contains", "items", "additionalItems",
  "unevaluatedItems", "not", "if", "then", "else", "contentSchema", "allOf", "anyOf", "oneOf", "prefixItems",
]);

function isJsonObject(value: unknown): value is McpJsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripLegacySchemaIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripLegacySchemaIds(item));
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(([key, child]) => {
        if (namedSchemaMapKeys.has(key) && isJsonObject(child)) {
          return [key, Object.fromEntries(Object.entries(child).map(([name, schema]) => [name, stripLegacySchemaIds(schema)]))];
        }
        return [key, schemaValueKeys.has(key) ? stripLegacySchemaIds(child) : child];
      }),
  );
}

export function mcpJsonSchemaWithoutLegacyIds(schema: McpJsonSchema): McpJsonSchema {
  const jsonSchema = stripLegacySchemaIds(schema);
  if (!isJsonObject(jsonSchema)) {
    throw new Error("MCP schema generation expected a JSON Schema object.");
  }
  return jsonSchema;
}

export function mcpOutputJsonSchemaForZodSchema(schema: z.ZodType): McpJsonSchema {
  return mcpJsonSchemaWithoutLegacyIds(
    z.toJSONSchema(schema, {
      io: "output",
      target: "draft-2020-12",
    }),
  );
}
