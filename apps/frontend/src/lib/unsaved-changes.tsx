"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface UnsavedChangesContextValue {
  hasUnsavedChanges: boolean;
  setDirty: (key: string, dirty: boolean) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<Record<string, true>>({});

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((current) => {
      if (dirty && current[key]) return current;
      if (!dirty && !current[key]) return current;
      const next = { ...current };
      if (dirty) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ hasUnsavedChanges: Object.keys(dirtyKeys).length > 0, setDirty }),
    [dirtyKeys, setDirty],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesState() {
  const context = useContext(UnsavedChangesContext);
  if (!context) throw new Error("useUnsavedChangesState must be used within UnsavedChangesProvider");
  return context;
}

export function useUnsavedChanges(key: string, dirty: boolean) {
  const { setDirty } = useUnsavedChangesState();

  useEffect(() => {
    setDirty(key, dirty);
    return () => setDirty(key, false);
  }, [dirty, key, setDirty]);
}
