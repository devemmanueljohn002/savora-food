/**
 * Type declarations for the plain-JS email template module. The .js file is
 * the source of truth (kept dependency-free for mail-client-safe HTML); this
 * shim only lets TypeScript import it with full types.
 */
export type BuiltEmail = {
  subject: string;
  htmlContent: string;
  textContent: string;
};

export function buildResetEmail(link: string, minutes?: number): BuiltEmail;
export function buildOtpEmail(code: string, minutes?: number): BuiltEmail;
