/**
 * StatCard tests.
 *
 * This component replaced hand-written markup in eight screens, so the tests
 * cover both layouts it has to serve — the management screens' figure-beside-an
 * -icon, and the reports' stacked coloured figure — and the setting that hides
 * the whole row.
 *
 * The visibility check lives in StatCardGrid rather than in each screen; a
 * screen that read the setting itself could be missed and keep rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DollarSign } from 'lucide-react';

const { useAppearanceSettings } = vi.hoisted(() => ({ useAppearanceSettings: vi.fn() }));

vi.mock('@/hooks/useSettings.hook', () => ({ useAppearanceSettings }));

import { StatCard, StatCardGrid } from '@/components/ui/StatCard';

/** Drives the stored appearance settings the visibility hook reads. */
const withSetting = (settings: Record<string, unknown> | undefined) => {
  useAppearanceSettings.mockReturnValue({ settings });
};

beforeEach(() => {
  vi.clearAllMocks();
  withSetting({});
});

afterEach(() => vi.restoreAllMocks());

describe('StatCard', () => {
  it('renders the label and the figure', () => {
    render(<StatCard label="Total Clients" value={42} />);

    expect(screen.getByText('Total Clients')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders a figure supplied as an element', () => {
    // Several screens pass <FormattedCurrency /> rather than a plain number.
    render(<StatCard label="Revenue" value={<span data-testid="money">$1,200.00</span>} />);

    expect(screen.getByTestId('money')).toBeTruthy();
  });

  it('renders a zero figure rather than treating it as absent', () => {
    render(<StatCard label="Overdue" value={0} />);

    expect(screen.getByText('0')).toBeTruthy();
  });

  it('shows an icon when one is given', () => {
    const { container } = render(<StatCard label="Revenue" value={1} icon={DollarSign} />);

    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('omits the icon for the stacked report layout', () => {
    const { container } = render(<StatCard label="Revenue" value={1} />);

    expect(container.querySelector('svg')).toBeNull();
  });

  it('colours the icon from the shared palette', () => {
    const { container } = render(
      <StatCard label="Revenue" value={1} icon={DollarSign} iconColor="green" />
    );

    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-green-600');
  });

  it('defaults the icon colour rather than leaving it unstyled', () => {
    const { container } = render(<StatCard label="Revenue" value={1} icon={DollarSign} />);

    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-blue-600');
  });

  it('colours the figure independently of the icon', () => {
    // The reports colour the number; the management screens colour the icon.
    render(<StatCard label="Overdue" value={7} icon={DollarSign} iconColor="blue" valueColor="red" />);

    expect(screen.getByText('7').className).toContain('text-red-600');
  });

  it('leaves the figure in the default colour when none is given', () => {
    render(<StatCard label="Total" value={7} />);

    expect(screen.getByText('7').className).not.toMatch(/text-(red|green|blue|purple)-600/);
  });

  it('honours each figure size', () => {
    const { rerender } = render(<StatCard label="A" value={1} />);
    expect(screen.getByText('1').className).toContain('text-3xl');

    rerender(<StatCard label="A" value={2} size="medium" />);
    expect(screen.getByText('2').className).toContain('text-2xl');

    rerender(<StatCard label="A" value={3} size="small" />);
    expect(screen.getByText('3').className).toContain('text-xl');
  });

  it('carries the shared card styling in both layouts', () => {
    const withIcon = render(<StatCard label="A" value={1} icon={DollarSign} />);
    expect(withIcon.container.firstChild).toHaveClass('bg-card');

    const withoutIcon = render(<StatCard label="B" value={1} />);
    expect(withoutIcon.container.firstChild).toHaveClass('bg-card');
  });
});

describe('StatCardGrid', () => {
  it('shows the cards by default', () => {
    withSetting({});

    render(
      <StatCardGrid className="grid">
        <StatCard label="Total" value={1} />
      </StatCardGrid>
    );

    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('shows the cards when the setting is explicitly on', () => {
    withSetting({ show_stat_cards: true });

    render(
      <StatCardGrid className="grid">
        <StatCard label="Total" value={1} />
      </StatCardGrid>
    );

    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('hides the whole row when the setting is off', () => {
    withSetting({ show_stat_cards: false });

    const { container } = render(
      <StatCardGrid className="grid">
        <StatCard label="Total" value={1} />
      </StatCardGrid>
    );

    expect(screen.queryByText('Total')).toBeNull();
    // The grid itself goes too, so no empty gap is left behind.
    expect(container.firstChild).toBeNull();
  });

  it('shows the cards while the setting is still loading', () => {
    // Flashing the cards away and back on every navigation would be worse
    // than ignoring the preference for a moment.
    withSetting(undefined);

    render(
      <StatCardGrid className="grid">
        <StatCard label="Total" value={1} />
      </StatCardGrid>
    );

    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('treats any non-false stored value as on', () => {
    withSetting({ show_stat_cards: 'yes' });

    render(
      <StatCardGrid className="grid">
        <StatCard label="Total" value={1} />
      </StatCardGrid>
    );

    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('keeps the grid classes the screen supplied', () => {
    withSetting({});

    const { container } = render(
      <StatCardGrid className="grid grid-cols-4 gap-6">
        <StatCard label="Total" value={1} />
      </StatCardGrid>
    );

    expect(container.firstChild).toHaveClass('grid-cols-4');
  });

  it('renders every card it is given', () => {
    withSetting({});

    render(
      <StatCardGrid className="grid">
        <StatCard label="One" value={1} />
        <StatCard label="Two" value={2} />
        <StatCard label="Three" value={3} />
      </StatCardGrid>
    );

    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getByText('Two')).toBeTruthy();
    expect(screen.getByText('Three')).toBeTruthy();
  });
});
