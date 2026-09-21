import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '@/components/ui/modal.cpt';

/**
 * happy-dom implements showModal(), open, close() and the close event, so the
 * lifecycle below is real. It does NOT implement a focus trap or the top
 * layer, so focus behaviour is verified in a browser instead of asserted here
 * — an assertion that passed against happy-dom's missing trap would be
 * asserting nothing.
 */
const open = (props: Partial<React.ComponentProps<typeof Modal>> = {}) =>
  render(
    <Modal open onClose={vi.fn()} title="Edit User" {...props}>
      <p>body</p>
    </Modal>
  );

describe('Modal', () => {
  it('opens as a modal dialog when open is true', () => {
    const { container } = open();
    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
  });

  it('stays closed when open is false', () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="Edit User"><p>body</p></Modal>
    );
    expect((container.querySelector('dialog') as HTMLDialogElement).open).toBe(false);
  });

  // Without an accessible name a dialog announces as nothing at all, which is
  // the defect the hand-rolled modals shipped with.
  it('names the dialog for assistive technology', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Edit User' })).toBeInTheDocument();
  });

  it('renders its description and children', () => {
    open({ description: 'Set a new password.' });
    expect(screen.getByText('Set a new password.')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('renders a footer when given one', () => {
    open({ footer: <button>Save</button> });
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClose from the close affordance', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the dialog emits close', () => {
    const onClose = vi.fn();
    const { container } = open({ onClose });
    fireEvent(container.querySelector('dialog')!, new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ConnectionLostDialog must not be dismissible: a dropped connection is not
  // a state the user can dismiss their way out of.
  it('suppresses Escape and hides the close affordance when not dismissible', () => {
    const onClose = vi.fn();
    const { container } = open({ onClose, dismissible: false });

    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();

    const cancel = new Event('cancel', { cancelable: true });
    container.querySelector('dialog')!.dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies the requested size', () => {
    const { container } = open({ size: '5xl' });
    expect(container.querySelector('dialog')!.className).toContain('max-w-5xl');
  });

  it('defaults to a medium size', () => {
    const { container } = open();
    expect(container.querySelector('dialog')!.className).toContain('max-w-md');
  });
});
