import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordRequirementsChecklist } from './PasswordRequirementsChecklist';
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from '@shared/passwordPolicy.util';

describe('PasswordRequirementsChecklist', () => {
  it('shows only the minimum length when no character class is required', () => {
    render(<PasswordRequirementsChecklist password="" policy={DEFAULT_PASSWORD_POLICY} />);

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.queryByText(/uppercase/i)).toBeNull();
  });

  it('shows a required character class and marks it unmet', () => {
    const policy: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, require_uppercase: true };
    render(<PasswordRequirementsChecklist password="lowercase" policy={policy} />);

    const item = screen.getByText(/an uppercase letter/i);
    expect(item).toHaveClass('text-muted-foreground');
  });

  it('marks a requirement met once the password satisfies it', () => {
    const policy: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, require_uppercase: true };
    render(<PasswordRequirementsChecklist password="Uppercase" policy={policy} />);

    const item = screen.getByText(/an uppercase letter/i);
    expect(item).toHaveClass('text-green-600');
  });

  it('marks the length requirement met once the password is long enough', () => {
    render(<PasswordRequirementsChecklist password="12345678" policy={DEFAULT_PASSWORD_POLICY} />);

    expect(screen.getByText(/at least 8 characters/i)).toHaveClass('text-green-600');
  });

  it('lists every required class the policy turns on', () => {
    const policy: PasswordPolicy = {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_special: true
    };
    render(<PasswordRequirementsChecklist password="" policy={policy} />);

    expect(screen.getByText(/an uppercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/a lowercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/a number/i)).toBeInTheDocument();
    expect(screen.getByText(/a special character/i)).toBeInTheDocument();
  });
});
