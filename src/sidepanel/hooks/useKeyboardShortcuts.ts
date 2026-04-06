import { useEffect, useCallback } from 'react';

interface UseKeyboardShortcutsProps {
  createNewSession: () => void;
}

export function useKeyboardShortcuts({ createNewSession }: UseKeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNewSession();
      }
    },
    [createNewSession]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
