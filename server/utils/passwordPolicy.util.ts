/**
 * Password-policy validation, kept separate from SettingsService so it loads
 * standalone under Vitest and is testable without a database.
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

/** Every rule the password fails, in plain language — empty when it satisfies the policy. */
export const validatePasswordAgainstPolicy = (password: string, policy: PasswordPolicy): string[] => {
  const violations: string[] = [];

  if (password.length < policy.min_length) {
    violations.push(`Password must be at least ${policy.min_length} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    violations.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    violations.push('Password must contain an uppercase letter');
  }
  if (policy.require_lowercase && !/[a-z]/.test(password)) {
    violations.push('Password must contain a lowercase letter');
  }
  if (policy.require_numbers && !/[0-9]/.test(password)) {
    violations.push('Password must contain a number');
  }
  if (policy.require_special && !/[^A-Za-z0-9]/.test(password)) {
    violations.push('Password must contain a special character');
  }

  return violations;
};
