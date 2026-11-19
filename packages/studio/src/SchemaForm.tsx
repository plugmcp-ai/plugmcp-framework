import type { JsonSchema } from "./api";

interface Props {
  schema: JsonSchema;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}

const typeOf = (schema: JsonSchema) => (Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type);

/** A form built from a tool's input schema. Nested shapes fall back to a JSON box. */
export function SchemaForm({ schema, value, onChange }: Props) {
  const properties = Object.entries(schema.properties ?? {});
  if (!properties.length) return <p className="note">This tool takes no input.</p>;
  const set = (key: string, next: unknown) => {
    const copy = { ...value };
    if (next === undefined || next === "") delete copy[key];
    else copy[key] = next;
    onChange(copy);
  };
  return (
    <div className="form">
      {properties.map(([key, field]) => {
        const type = typeOf(field);
        const required = schema.required?.includes(key);
        const current = value[key];
        const id = `field-${key}`;
        return (
          <div className="field" key={key}>
            <label htmlFor={id}>
              {key}
              {required ? null : <span className="optional">optional</span>}
            </label>
            {field.enum ? (
              <select id={id} value={String(current ?? "")} onChange={(event) => set(key, event.target.value)}>
                <option value="">Choose</option>
                {field.enum.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
            ) : type === "boolean" ? (
              <label className="check">
                <input id={id} type="checkbox" checked={current === true} onChange={(event) => set(key, event.target.checked)} />
                Yes
              </label>
            ) : type === "number" || type === "integer" ? (
              <input
                id={id}
                type="number"
                value={current === undefined ? "" : String(current)}
                onChange={(event) => set(key, event.target.value === "" ? undefined : Number(event.target.value))}
              />
            ) : type === "string" || type === undefined ? (
              <input id={id} type="text" value={String(current ?? "")} onChange={(event) => set(key, event.target.value)} />
            ) : (
              <textarea
                id={id}
                rows={3}
                className="mono"
                placeholder={type === "array" ? "[ ]" : "{ }"}
                defaultValue={current === undefined ? "" : JSON.stringify(current, null, 2)}
                onBlur={(event) => {
                  try {
                    set(key, event.target.value.trim() ? JSON.parse(event.target.value) : undefined);
                    event.target.setCustomValidity("");
                  } catch {
                    event.target.setCustomValidity("This is not valid JSON.");
                    event.target.reportValidity();
                  }
                }}
              />
            )}
            {field.description ? <p className="hint">{field.description}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
