import React, { useEffect, useRef } from 'react';
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // showModal() throws if the dialog is already open, and close() on an
    // already-closed dialog fires a spurious close event that would call
    // onClose during unmount.
    if (open && !dialog.open) {
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
    const handleClose = () => onClose();

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [dismissible, onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={cn(
        'w-full rounded-lg border border-border bg-card p-6 text-foreground shadow-xl',
        'max-h-[90vh] overflow-y-auto backdrop:bg-black/50',
        SIZES[size]
      )}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
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
