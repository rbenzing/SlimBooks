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

  // The description is meaningless to assistive technology unless the
  // dialog itself points at it: aria-describedby must resolve to the
  // element carrying the description text, and must be absent entirely
  // when there is no description to point at.
  it('associates the description with the dialog via aria-describedby', () => {
    const { container } = open({ description: 'Set a new password.' });
    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    const describedBy = dialog.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Set a new password.');
  });

  it('omits aria-describedby when there is no description', () => {
    const { container } = open();
    expect(container.querySelector('dialog')!.hasAttribute('aria-describedby')).toBe(false);
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

  it('applies the 4xl size', () => {
    const { container } = open({ size: '4xl' });
    expect(container.querySelector('dialog')!.className).toContain('max-w-4xl');
  });

  it('defaults to a medium size', () => {
    const { container } = open();
    expect(container.querySelector('dialog')!.className).toContain('max-w-md');
  });

  // The native <dialog> only restores focus to the opener while that node
  // survives the close. Seven call sites pass a bare `open` and are unmounted
  // by their parent on close, so the browser has nothing left to restore to
  // and focus falls to <body>. These three cases verify Modal restores focus
  // itself instead of relying on the native behaviour.
  describe('focus restoration', () => {
    it('returns focus to the opener when the modal closes while still mounted', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();
      expect(document.activeElement).toBe(opener);

      const { container } = open();
      const dialog = container.querySelector('dialog') as HTMLDialogElement;
      // Simulate focus having moved into the dialog while it was open.
      dialog.focus();
      expect(document.activeElement).toBe(dialog);

      fireEvent(dialog, new Event('close'));

      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it('returns focus to the opener when the modal is unmounted while open', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();

      const { container, unmount } = open();
      const dialog = container.querySelector('dialog') as HTMLDialogElement;
      dialog.focus();
      expect(document.activeElement).toBe(dialog);

      // The conditional-mount call sites unmount Modal directly instead of
      // flipping `open`, so the dialog's own `close` event never fires — this
      // is the case that reproduced the reported bug.
      unmount();

      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it('does not throw when there was no meaningful opener', () => {
      // happy-dom defaults document.activeElement to body when nothing has
      // been focused.
      expect(document.activeElement).toBe(document.body);

      expect(() => {
        const { container, unmount } = open();
        fireEvent(container.querySelector('dialog')!, new Event('close'));
        unmount();
      }).not.toThrow();
    });
  });
});
