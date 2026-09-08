import { describe, it, expect } from 'vitest';
import { DEFAULT_PASSWORD_POLICY, MAX_PASSWORD_LENGTH, validatePasswordAgainstPolicy, type PasswordPolicy } from './passwordPolicy.util.js';

describe('validatePasswordAgainstPolicy', () => {
  it('passes a password meeting the default policy', () => {
    expect(validatePasswordAgainstPolicy('a valid password', DEFAULT_PASSWORD_POLICY)).toEqual([]);
  });

  it('rejects a password shorter than min_length', () => {
    const violations = validatePasswordAgainstPolicy('short', { ...DEFAULT_PASSWORD_POLICY, min_length: 8 });
    expect(violations).toContain('Password must be at least 8 characters');
  });

  it('rejects a password longer than MAX_PASSWORD_LENGTH regardless of policy', () => {
    const tooLong = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
    const violations = validatePasswordAgainstPolicy(tooLong, DEFAULT_PASSWORD_POLICY);
    expect(violations).toContain(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  });

  it.each([
    ['require_uppercase', 'nouppercasehere1!', 'Password must contain an uppercase letter'],
    ['require_lowercase', 'NOLOWERCASEHERE1!', 'Password must contain a lowercase letter'],
    ['require_numbers', 'NoNumbersHere!', 'Password must contain a number'],
    ['require_special', 'NoSpecialChars1', 'Password must contain a special character']
  ] as const)('enforces %s', (field, password, expectedMessage) => {
    const policy = { ...DEFAULT_PASSWORD_POLICY, [field]: true };
    expect(validatePasswordAgainstPolicy(password, policy)).toContain(expectedMessage);
  });

  it('returns every violation at once, not just the first', () => {
    const strictPolicy: PasswordPolicy = {
      min_length: 12, require_uppercase: true, require_lowercase: true, require_numbers: true, require_special: true
    };
    const violations = validatePasswordAgainstPolicy('short', strictPolicy);
    expect(violations.length).toBeGreaterThan(1);
  });
});
