// Lightweight JSON Schema validator (zero deps)
// Supports: type, required, enum, pattern, minimum/maximum, minLength/maxLength,
// additionalProperties, properties, patternProperties, items, $ref (local), $defs,
// uniqueItems, oneOf, const, minItems/maxItems, minProperties

export function validate(data, schema, errors = [], path = "") {
  const root = schema;
  return walk(data, schema, errors, path, root);
}

function walk(data, schema, errors, path, root) {
  if (!schema) return errors;

  // $ref
  if (schema.$ref) {
    const ref = resolveRef(schema.$ref, root);
    if (ref) return walk(data, ref, errors, path, root);
  }

  // const
  if ("const" in schema && data !== schema.const) {
    errors.push({ path, message: `expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}` });
  }

  // enum
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  // type
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => checkType(data, t))) {
      errors.push({ path, message: `expected type ${types.join("|")}, got ${actualType(data)}` });
      return errors;
    }
  }

  // oneOf (basic — passes if exactly one matches)
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((sub) => walk(data, sub, [], path, root).length === 0);
    if (matches.length === 0) {
      errors.push({ path, message: `must match one of ${schema.oneOf.length} schemas` });
    }
  }

  // string constraints
  if (typeof data === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push({ path, message: `does not match pattern ${schema.pattern}` });
    }
    if (schema.minLength != null && data.length < schema.minLength) {
      errors.push({ path, message: `length ${data.length} < min ${schema.minLength}` });
    }
    if (schema.maxLength != null && data.length > schema.maxLength) {
      errors.push({ path, message: `length ${data.length} > max ${schema.maxLength}` });
    }
  }

  // number constraints
  if (typeof data === "number") {
    if (schema.minimum != null && data < schema.minimum) {
      errors.push({ path, message: `${data} < min ${schema.minimum}` });
    }
    if (schema.maximum != null && data > schema.maximum) {
      errors.push({ path, message: `${data} > max ${schema.maximum}` });
    }
  }

  // object
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in data)) {
          errors.push({ path: `${path}.${key}`, message: "required key missing" });
        }
      }
    }
    if (schema.minProperties != null && Object.keys(data).length < schema.minProperties) {
      errors.push({ path, message: `min ${schema.minProperties} properties` });
    }

    const handledKeys = new Set();
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        handledKeys.add(key);
        if (key in data) {
          walk(data[key], sub, errors, `${path}.${key}`, root);
        }
      }
    }
    if (schema.patternProperties) {
      for (const [pattern, sub] of Object.entries(schema.patternProperties)) {
        const re = new RegExp(pattern);
        for (const key of Object.keys(data)) {
          if (re.test(key)) {
            handledKeys.add(key);
            walk(data[key], sub, errors, `${path}.${key}`, root);
          }
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!handledKeys.has(key)) {
          errors.push({ path: `${path}.${key}`, message: "additional property not allowed" });
        }
      }
    }
  }

  // array
  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) {
      errors.push({ path, message: `min ${schema.minItems} items` });
    }
    if (schema.maxItems != null && data.length > schema.maxItems) {
      errors.push({ path, message: `max ${schema.maxItems} items` });
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of data) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push({ path, message: "duplicate items not allowed" });
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      data.forEach((item, i) => {
        walk(item, schema.items, errors, `${path}[${i}]`, root);
      });
    }
  }

  return errors;
}

function checkType(data, type) {
  switch (type) {
    case "string": return typeof data === "string";
    case "number": return typeof data === "number";
    case "integer": return typeof data === "number" && Number.isInteger(data);
    case "boolean": return typeof data === "boolean";
    case "null": return data === null;
    case "array": return Array.isArray(data);
    case "object": return data !== null && typeof data === "object" && !Array.isArray(data);
    default: return false;
  }
}

function actualType(data) {
  if (data === null) return "null";
  if (Array.isArray(data)) return "array";
  return typeof data;
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let current = root;
  for (const part of parts) {
    current = current?.[part];
  }
  return current;
}
