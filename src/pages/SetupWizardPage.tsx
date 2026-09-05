// First-run setup wizard. Shown instead of the normal app whenever
// GET /api/setup/status reports needsSetup: true (App.tsx).

import { useState, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CompanySettings } from '@/components/settings/CompanySettings';
import { EmailSettings } from '@/components/settings/EmailSettings';
import { StripeSettingsTab } from '@/components/settings/StripeSettingsTab';
import { GoogleSettingsTab } from '@/components/settings/GoogleSettingsTab';
import type { SettingsTabRef } from '@/types';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

interface WizardStepProps {
  onAdvance: () => void;
}

const INPUT_CLASSES =
  'w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-card-foreground';

/** Step 1: create the first administrator. Mandatory — there is no skip. */
const AdminAccountStep = ({ onAdvance }: WizardStepProps) => {
  const { completeSetup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await completeSetup(name, email, username, password);
      if (!response.success) {
        setError(response.message || 'Setup failed. Please try again.');
        return;
      }
      onAdvance();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-card-foreground">Create the administrator account</h2>
        <p className="text-sm text-muted-foreground">This is the only account this install starts with.</p>
      </div>

      {error && (
        <div className="flex items-center space-x-2 text-destructive bg-destructive/10 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="setup-name" className="block text-sm font-medium text-card-foreground mb-2">Name</label>
        <input id="setup-name" type="text" value={name} onChange={e => setName(e.target.value)} required className={INPUT_CLASSES} />
      </div>
      <div>
        <label htmlFor="setup-email" className="block text-sm font-medium text-card-foreground mb-2">Email</label>
        <input id="setup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className={INPUT_CLASSES} />
      </div>
      <div>
        <label htmlFor="setup-username" className="block text-sm font-medium text-card-foreground mb-2">Username</label>
        <input id="setup-username" type="text" value={username} onChange={e => setUsername(e.target.value)} required className={INPUT_CLASSES} />
      </div>
      <div>
        <label htmlFor="setup-password" className="block text-sm font-medium text-card-foreground mb-2">Password</label>
        <input id="setup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className={INPUT_CLASSES} />
      </div>
      <div>
        <label htmlFor="setup-confirm-password" className="block text-sm font-medium text-card-foreground mb-2">Confirm password</label>
        <input id="setup-confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={INPUT_CLASSES} />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Creating account…' : 'Create administrator account'}
      </button>
    </form>
  );
};

/** Step 2: company details, shown on every invoice. Mandatory, no skip. */
const CompanyInfoStep = ({ onAdvance }: WizardStepProps) => {
  const ref = useRef<SettingsTabRef>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleNext = async () => {
    setIsSaving(true);
    try {
      await ref.current?.saveSettings?.();
      onAdvance();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-card-foreground">Company information</h2>
        <p className="text-sm text-muted-foreground">Shown on every invoice. You can change this later in Settings.</p>
      </div>
      <CompanySettings ref={ref} />
      <button
        type="button"
        onClick={handleNext}
        disabled={isSaving}
        className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:bg-primary/90 disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : 'Next'}
      </button>
    </div>
  );
};

interface IntegrationStepProps extends WizardStepProps {
  title: string;
  description: string;
  Component: ForwardRefExoticComponent<RefAttributes<SettingsTabRef>>;
}

/** Steps 3-5: optional integrations, each reusing its real Settings tab. */
const IntegrationStep = ({ title, description, Component, onAdvance }: IntegrationStepProps) => {
  const ref = useRef<SettingsTabRef>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAndContinue = async () => {
    setIsSaving(true);
    try {
      await ref.current?.saveSettings?.();
    } finally {
      setIsSaving(false);
      onAdvance();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-card-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Component ref={ref} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAdvance}
          className="flex-1 border border-border py-2 px-4 rounded-lg hover:bg-accent transition-colors"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={handleSaveAndContinue}
          disabled={isSaving}
          className="flex-1 bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save and continue'}
        </button>
      </div>
    </div>
  );
};

interface WizardStep {
  key: string;
  render: (advance: () => void) => React.ReactNode;
}

export const SetupWizardPage = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();

  const steps: WizardStep[] = [
    { key: 'admin', render: advance => <AdminAccountStep onAdvance={advance} /> },
    { key: 'company', render: advance => <CompanyInfoStep onAdvance={advance} /> },
    {
      key: 'email',
      render: advance => (
        <IntegrationStep
          title="Email"
          description="Needed to send password resets and notifications. Optional — configure later in Settings."
          Component={EmailSettings}
          onAdvance={advance}
        />
      )
    },
    {
      key: 'stripe',
      render: advance => (
        <IntegrationStep
          title="Stripe"
          description="Accept card payments on invoices. Optional — configure later in Settings."
          Component={StripeSettingsTab}
          onAdvance={advance}
        />
      )
    },
    {
      key: 'google',
      render: advance => (
        <IntegrationStep
          title="Google Sign-In"
          description="Let users sign in with Google. Optional — configure later in Settings."
          Component={GoogleSettingsTab}
          onAdvance={advance}
        />
      )
    }
  ];

  const advance = () => {
    if (stepIndex >= steps.length - 1) {
      navigate('/dashboard', { replace: true });
      return;
    }
    setStepIndex(stepIndex + 1);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-lg shadow-lg p-8 border border-border">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-card-foreground">Welcome to Slimbooks</h1>
          <p className="text-muted-foreground mt-2">Step {stepIndex + 1} of {steps.length}</p>
        </div>
        {steps[stepIndex].render(advance)}
      </div>
    </div>
  );
};
