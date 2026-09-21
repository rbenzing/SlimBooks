import React, { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/themeUtils.util';

/**
 * The application's only modal.
 *
 * Built on the native <dialog> element, whose showModal() supplies the focus
 * trap, Escape handling, top layer, inert background and focus-return that
 * eleven hand-rolled `fixed inset-0` modals each lacked, and that the two
 * Radix ones needed a 1.1 MB dependency to get.
 *
 * The dialog element is the panel itself rather than a wrapper around one:
 * the browser centres it and paints the scrim through ::backdrop, so no
 * overlay div is needed.
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl';

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl'
};

interface ModalProps {
  /**
   * Two valid idioms, both correct today:
   *  - Bare `open` (the parent always renders `<Modal open .../>` and
   *    unmounts Modal itself on close) — relies entirely on the parent to
   *    tear the component down; Modal never sees `open` go false.
   *  - `open={state}` (the parent keeps Modal mounted and flips a boolean).
   * Bare `open` is a trap: if a future parent's `onClose` stops unmounting
   * (e.g. it's changed to just clear some other state), the dialog still
   * closes natively via Escape/cancel, but `open` never becomes false, so
   * the open-effect has nothing to react to and the dialog can't reopen —
   * a permanently invisible modal with no error. Only use bare `open` when
   * the parent unmounts Modal on every close path.
   */
  open: boolean;
  onClose: () => void;
  /** Required: a dialog with no accessible name announces as nothing. */
  title: string;
  description?: string;
  size?: ModalSize;
  /** False blocks Escape and hides the close affordance. */
  dismissible?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  size = 'md',
  dismissible = true,
  footer,
  children
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();

  // The element that was focused right before we called showModal(), so we
  // can put focus back on it ourselves. The native <dialog> only restores
  // focus to this element while it survives the close; call sites that
  // unmount the dialog on close (instead of toggling `open`) lose that native
  // behaviour entirely because the node it would restore to is already gone
  // by the time the browser tries.
  const openerRef = useRef<HTMLElement | null>(null);

  // Stable across renders (no reactive values in the body) so it can sit in
  // effect dependency arrays — including the unmount-only effect below —
  // without causing them to re-run.
  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null; // clear so a later open can't restore a stale node

    // The opener may have been unmounted by the parent (the very case this
    // exists for) or otherwise become unfocusable; either way there is
    // nothing safe to do but leave focus where the browser put it.
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus();
    }
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // showModal() throws if the dialog is already open, and close() on an
    // already-closed dialog fires a spurious close event that would call
    // onClose during unmount.
    if (open && !dialog.open) {
      const active = document.activeElement;
      // document.body means nothing meaningful was focused before opening
      // (e.g. a programmatic open) — leave the ref empty so close doesn't
      // try to "restore" focus onto the body.
      openerRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `close` covers every route out: Escape, the close button, and a
    // programmatic close. `cancel` fires first for Escape only, which is where
    // a non-dismissible dialog refuses.
    const handleCancel = (event: Event) => {
      if (!dismissible) event.preventDefault();
    };
    const handleClose = () => {
      restoreFocus();
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [dismissible, onClose, restoreFocus]);

  useEffect(() => {
    // A parent that unmounts Modal outright instead of flipping `open` (the
    // pattern this whole fix exists for) never fires the dialog's `close`
    // event, so the listener above misses it too — unmount is the last
    // chance to put focus back on the opener.
    return () => {
      restoreFocus();
    };
  }, [restoreFocus]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'w-[calc(100%-2rem)] rounded-lg border border-border bg-card p-6 text-foreground shadow-xl',
        'max-h-[90vh] overflow-y-auto backdrop:bg-black/50',
        SIZES[size]
      )}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {description ? (
            <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {dismissible ? (
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-6 w-6" />
          </button>
        ) : null}
      </div>

      {children}

      {footer ? (
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
};

export default Modal;
