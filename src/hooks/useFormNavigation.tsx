
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Modal from '@/components/ui/modal.cpt';

interface UseFormNavigationProps {
  isDirty: boolean;
  isEnabled: boolean;
  entityType: 'client' | 'invoice' | 'expense' | 'template' | 'payment';
  onCancel?: () => void;
}

export const useFormNavigation = ({ isDirty, isEnabled, entityType, onCancel }: UseFormNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingNavigationRef = useRef<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    // Enable beforeunload for both create and edit pages
    if (!isEnabled || !isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Don't show browser dialog if we're handling navigation internally
      if (isNavigatingRef.current) return;
      
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, isEnabled, location.pathname]);

  const confirmNavigation = (targetPath: string) => {
    if (!isEnabled || !isDirty) {
      if (targetPath === 'back' && onCancel) {
        onCancel();
      } else if (targetPath === 'back') {
        window.history.back();
      } else {
        navigate(targetPath);
      }
      return;
    }

    // Flag that we're handling navigation internally
    isNavigatingRef.current = true;
    pendingNavigationRef.current = targetPath;
    setShowDialog(true);
  };

  const handleConfirmNavigation = () => {
    if (pendingNavigationRef.current) {
      if (pendingNavigationRef.current === 'back' && onCancel) {
        onCancel();
      } else if (pendingNavigationRef.current === 'back') {
        window.history.back();
      } else if (pendingNavigationRef.current === 'cancel' && onCancel) {
        onCancel();
      } else {
        navigate(pendingNavigationRef.current);
      }
      pendingNavigationRef.current = null;
    }
    isNavigatingRef.current = false;
    setShowDialog(false);
  };

  const handleCancelNavigation = () => {
    pendingNavigationRef.current = null;
    isNavigatingRef.current = false;
    setShowDialog(false);
  };

  const NavigationGuard = () => (
    <Modal
      open={showDialog}
      onClose={handleCancelNavigation}
      title="Unsaved Changes"
      description={`Are you sure you want to cancel ${
        entityType === 'client' ? 'adding/editing this client' :
        entityType === 'invoice' ? 'adding/editing this invoice' :
        entityType === 'template' ? 'adding/editing this template' :
        'adding/editing this expense'
      }? Any unsaved changes will be lost.`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={handleCancelNavigation}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            No, Continue Editing
          </button>
          <button
            type="button"
            onClick={handleConfirmNavigation}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Yes, Discard Changes
          </button>
        </>
      }
    >
      {null}
    </Modal>
  );

  return {
    confirmNavigation,
    NavigationGuard
  };
};
