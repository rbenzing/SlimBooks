import { Check, X } from 'lucide-react';
import { PASSWORD_REQUIREMENTS, type PasswordPolicy } from '@shared/passwordPolicy.util';

interface PasswordRequirementsChecklistProps {
  password: string;
  policy: PasswordPolicy;
}

/**
 * Live feedback against the actual, admin-configured policy — not a fixed
 * list. Reuses `PASSWORD_REQUIREMENTS` from the shared validator, so a
 * requirement shown here as met is always one `validatePasswordAgainstPolicy`
 * agrees is met; the two cannot drift apart, because they're the same table.
 */
export const PasswordRequirementsChecklist = ({ password, policy }: PasswordRequirementsChecklistProps) => {
  const items: { label: string; met: boolean }[] = [
    { label: `at least ${policy.min_length} characters`, met: password.length >= policy.min_length }
  ];

  for (const requirement of PASSWORD_REQUIREMENTS) {
    if (policy[requirement.key]) {
      items.push({ label: requirement.label, met: requirement.test(password) });
    }
  }

  return (
    <ul className="mt-2 space-y-1 text-sm" aria-label="Password requirements">
      {items.map(item => (
        <li
          key={item.label}
          className={`flex items-center gap-1.5 ${item.met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
        >
          {item.met ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {item.label}
        </li>
      ))}
    </ul>
  );
};
