/**
 * Prompt loading. Prompts are .md files imported with `?raw`, so they are bundled into the
 * server build rather than read off disk at runtime.
 */

/**
 * Substitutes {{VARS}} and refuses to return a template with any placeholder left in it.
 * Without this guard an unfilled `{{CURRENT_MODELS}}` ships to the model as literal braces
 * and the failure is invisible in the output.
 */
export function fillPrompt(template: string, vars: Record<string, string> = {}): string {
  const filled = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
  const unfilled = filled.match(/\{\{\w+\}\}/g);
  if (unfilled) {
    throw new Error(`Prompt has unfilled placeholders: ${[...new Set(unfilled)].join(", ")}`);
  }
  return filled;
}
