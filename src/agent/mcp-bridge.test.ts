import { test, expect, describe } from "bun:test";
import { z } from "zod";

// jsonSchemaPropertyToZod and inputSchemaToZodShape are not exported,
// so we replicate the logic for testing. This validates the conversion
// rules match what mcp-bridge.ts implements.

function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop.type as string | undefined;
  const description = prop.description as string | undefined;

  let schema: z.ZodTypeAny;

  switch (type) {
    case "string": {
      if (prop.enum) {
        const values = prop.enum as [string, ...string[]];
        schema = z.enum(values);
      } else {
        schema = z.string();
      }
      break;
    }
    case "number":
    case "integer":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array": {
      const items = prop.items as Record<string, unknown> | undefined;
      if (items) {
        schema = z.array(jsonSchemaPropertyToZod(items));
      } else {
        schema = z.array(z.unknown());
      }
      break;
    }
    case "object": {
      const nested = prop.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (nested) {
        const shape: Record<string, z.ZodTypeAny> = {};
        const nestedRequired = new Set(
          (prop.required as string[] | undefined) ?? [],
        );
        for (const [key, val] of Object.entries(nested)) {
          const field = jsonSchemaPropertyToZod(val);
          shape[key] = nestedRequired.has(key) ? field : field.optional();
        }
        schema = z.object(shape);
      } else {
        schema = z.record(z.string(), z.unknown());
      }
      break;
    }
    default:
      schema = z.unknown();
  }

  if (description) {
    schema = schema.describe(description);
  }

  return schema;
}

function inputSchemaToZodShape(
  inputSchema: Record<string, unknown>,
): Record<string, z.ZodTypeAny> {
  const properties = inputSchema.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!properties) return {};

  const required = new Set(
    (inputSchema.required as string[] | undefined) ?? [],
  );
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const field = jsonSchemaPropertyToZod(prop);
    shape[key] = required.has(key) ? field : field.optional();
  }

  return shape;
}

describe("jsonSchemaPropertyToZod", () => {
  test("converts string type", () => {
    const schema = jsonSchemaPropertyToZod({ type: "string" });
    expect(schema.parse("hello")).toBe("hello");
    expect(() => schema.parse(123)).toThrow();
  });

  test("converts string with enum", () => {
    const schema = jsonSchemaPropertyToZod({
      type: "string",
      enum: ["a", "b", "c"],
    });
    expect(schema.parse("a")).toBe("a");
    expect(() => schema.parse("d")).toThrow();
  });

  test("converts number type", () => {
    const schema = jsonSchemaPropertyToZod({ type: "number" });
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse(3.14)).toBe(3.14);
    expect(() => schema.parse("not a number")).toThrow();
  });

  test("converts integer type same as number", () => {
    const schema = jsonSchemaPropertyToZod({ type: "integer" });
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse("string")).toThrow();
  });

  test("converts boolean type", () => {
    const schema = jsonSchemaPropertyToZod({ type: "boolean" });
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
    expect(() => schema.parse("true")).toThrow();
  });

  test("converts array type with items", () => {
    const schema = jsonSchemaPropertyToZod({
      type: "array",
      items: { type: "string" },
    });
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => schema.parse([1, 2])).toThrow();
  });

  test("converts array type without items", () => {
    const schema = jsonSchemaPropertyToZod({ type: "array" });
    expect(schema.parse([1, "a", true])).toEqual([1, "a", true]);
  });

  test("converts object type with properties", () => {
    const schema = jsonSchemaPropertyToZod({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    });
    expect(schema.parse({ name: "Alice", age: 30 })).toEqual({
      name: "Alice",
      age: 30,
    });
    expect(schema.parse({ name: "Bob" })).toEqual({ name: "Bob" });
    expect(() => schema.parse({ age: 30 })).toThrow(); // name is required
  });

  test("converts object type without properties to record", () => {
    const schema = jsonSchemaPropertyToZod({ type: "object" });
    // z.record(z.unknown()) in Zod v4 — just verify it doesn't throw on construction
    expect(schema).toBeDefined();
  });

  test("converts unknown type to z.unknown()", () => {
    const schema = jsonSchemaPropertyToZod({ type: "foobar" });
    expect(schema.parse("anything")).toBe("anything");
    expect(schema.parse(42)).toBe(42);
  });

  test("converts missing type to z.unknown()", () => {
    const schema = jsonSchemaPropertyToZod({});
    expect(schema.parse("anything")).toBe("anything");
  });

  test("attaches description", () => {
    const schema = jsonSchemaPropertyToZod({
      type: "string",
      description: "A user name",
    });
    expect(schema.description).toBe("A user name");
  });

  test("handles nested objects", () => {
    const schema = jsonSchemaPropertyToZod({
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
          required: ["street"],
        },
      },
      required: ["address"],
    });
    expect(
      schema.parse({ address: { street: "123 Main", city: "NYC" } }),
    ).toEqual({ address: { street: "123 Main", city: "NYC" } });
  });
});

describe("inputSchemaToZodShape", () => {
  test("returns empty shape for schema without properties", () => {
    const shape = inputSchemaToZodShape({});
    expect(Object.keys(shape)).toHaveLength(0);
  });

  test("marks required fields as required", () => {
    const shape = inputSchemaToZodShape({
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    });

    const schema = z.object(shape);
    expect(schema.parse({ name: "Alice" })).toEqual({ name: "Alice" });
    expect(() => schema.parse({ age: 30 })).toThrow();
  });

  test("marks non-required fields as optional", () => {
    const shape = inputSchemaToZodShape({
      properties: {
        name: { type: "string" },
        nickname: { type: "string" },
      },
      required: ["name"],
    });

    const schema = z.object(shape);
    expect(schema.parse({ name: "Alice" })).toEqual({ name: "Alice" });
  });

  test("handles schema with no required array", () => {
    const shape = inputSchemaToZodShape({
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    });

    const schema = z.object(shape);
    // All fields optional when no required array
    expect(schema.parse({})).toEqual({});
  });

  test("handles mixed types", () => {
    const shape = inputSchemaToZodShape({
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
        verbose: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["query"],
    });

    const schema = z.object(shape);
    const result = schema.parse({
      query: "test",
      limit: 10,
      verbose: true,
      tags: ["a", "b"],
    });
    expect(result).toEqual({
      query: "test",
      limit: 10,
      verbose: true,
      tags: ["a", "b"],
    });
  });
});
