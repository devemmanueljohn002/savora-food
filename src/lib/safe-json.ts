/**
 * Serialize JSON-LD for dangerouslySetInnerHTML. JSON.stringify does NOT
 * escape `</script>`, so vendor-controlled strings (names, descriptions)
 * could break out of the script tag into stored XSS. Escaping `<` as
 * \u003c keeps the JSON valid (parsed identically by JSON parsers and
 * schema consumers) while neutralizing the breakout.
 */
export function toJsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
