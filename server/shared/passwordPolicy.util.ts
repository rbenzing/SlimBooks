/**
 * Password-policy validation.
 *
 * Lives under `server/shared/` — the one directory in this project whose
 * files are guaranteed dependency-free, and therefore safe to bundle into
 * the browser. This is the single implementation for both sides: the server
 * imports it directly, the client through the `@shared/*` alias
 * (`vite.config.ts`, `vitest.config.ts`, `tsconfig.json`). Before this, the
 * client kept its own separate copy (`AuthUtils.validatePassword`) with a
 * different field name for one requirement and a narrower special-character
 * rule — the two could reach different verdicts on the same password.
 *
 * `min_length` and the four character-class requirements are the live,
 * DB-backed policy (`security.password_policy.*` in `SettingsService`) — an
 * admin can tighten or loosen them from Settings. `MAX_PASSWORD_LENGTH` is
 * not part of that policy; it is a fixed ceiling matching bcrypt's practical
 * input limit, not something an admin can raise or lower.
 */

export interface PasswordPolicy {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_numbers: boolean;
  require_special: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  min_length: 8,
  require_uppercase: false,
  require_lowercase: false,
  require_numbers: false,
  require_special: false
};

export const MAX_PASSWORD_LENGTH = 128;

/**
 * Every character-class requirement the policy can turn on: its label as it
 * appears in a violation message ("Password must contain " + label) and in
 * the requirements checklist, and how to check a candidate password against
 * it. `validatePasswordAgainstPolicy` and `PasswordRequirementsChecklist`
 * (`src/components/PasswordRequirementsChecklist.tsx`) both iterate this
 * table, so a password that satisfies the checklist always satisfies the
 * validator and vice versa — there is nowhere for the two to diverge.
 */
export const PASSWORD_REQUIREMENTS: Array<{
  key: keyof Omit<PasswordPolicy, 'min_length'>;
  label: string;
  test: (password: string) => boolean;
}> = [
  { key: 'require_uppercase', label: 'an uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { key: 'require_lowercase', label: 'a lowercase letter', test: (p) => /[a-z]/.test(p) },
  { key: 'require_numbers', label: 'a number', test: (p) => /[0-9]/.test(p) },
  { key: 'require_special', label: 'a special character', test: (p) => /[^A-Za-z0-9]/.test(p) }
];

/** Every rule the password fails, in plain language — empty when it satisfies the policy. */
export const validatePasswordAgainstPolicy = (password: string, policy: PasswordPolicy): string[] => {
  const violations: string[] = [];

  if (password.length < policy.min_length) {
    violations.push(`Password must be at least ${policy.min_length} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    violations.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  for (const requirement of PASSWORD_REQUIREMENTS) {
    if (policy[requirement.key] && !requirement.test(password)) {
      violations.push(`Password must contain ${requirement.label}`);
    }
  }

  return violations;
};
