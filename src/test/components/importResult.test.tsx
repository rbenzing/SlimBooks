import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportResult } from '@/components/ui/ImportResult.cpt';

const outcome = {
  imported: 143,
  failed: 7,
  errors: ['Expense 12: amount must be a number', 'Expense 48: category is required'],
  span: { earliest: '2024-01-03', latest: '2025-12-28' }
};

describe('ImportResult', () => {
  it('reports both counts', () => {
    render(<ImportResult outcome={outcome} hiddenCount={96} onShowImported={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText(/143/)).toBeInTheDocument();
    expect(screen.getByText(/7/)).toBeInTheDocument();
  });

  it('shows why each row failed, rather than sending it to the console', () => {
    render(<ImportResult outcome={outcome} hiddenCount={0} onShowImported={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText('Expense 12: amount must be a number')).toBeInTheDocument();
    expect(screen.getByText('Expense 48: category is required')).toBeInTheDocument();
  });

  it('offers to widen the view only when rows are hidden', () => {
    const { rerender } = render(
      <ImportResult outcome={outcome} hiddenCount={96} onShowImported={vi.fn()} onDone={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /show all imported/i })).toBeInTheDocument();

    rerender(<ImportResult outcome={outcome} hiddenCount={0} onShowImported={vi.fn()} onDone={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /show all imported/i })).not.toBeInTheDocument();
  });

  it('never moves the view on its own', async () => {
    const onShowImported = vi.fn();
    render(<ImportResult outcome={outcome} hiddenCount={96} onShowImported={onShowImported} onDone={vi.fn()} />);
    expect(onShowImported).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /show all imported/i }));
    expect(onShowImported).toHaveBeenCalledWith('2024-01-03', '2025-12-28');
  });

  it('says plainly when nothing was imported', () => {
    render(
      <ImportResult
        outcome={{ imported: 0, failed: 3, errors: ['Expense 1: bad'], span: null }}
        hiddenCount={0}
        onShowImported={vi.fn()}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(/nothing was imported/i)).toBeInTheDocument();
  });
});
