"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DashboardPageMeta = {
  title: string;
  subtitle?: string;
  fullWidthContent?: boolean;
};

const DEFAULT_META: DashboardPageMeta = {
  title: "Dashboard",
  subtitle: undefined,
  fullWidthContent: false,
};

type DashboardPageContextValue = {
  meta: DashboardPageMeta;
  setMeta: (meta: DashboardPageMeta) => void;
};

const DashboardPageContext = createContext<DashboardPageContextValue | null>(null);

export function DashboardPageProvider({ children }: { children: ReactNode }) {
  const [meta, setMetaState] = useState<DashboardPageMeta>(DEFAULT_META);
  const setMeta = useCallback((next: DashboardPageMeta) => {
    setMetaState((prev) => {
      if (
        prev.title === next.title &&
        prev.subtitle === next.subtitle &&
        prev.fullWidthContent === next.fullWidthContent
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ meta, setMeta }), [meta, setMeta]);
  return <DashboardPageContext.Provider value={value}>{children}</DashboardPageContext.Provider>;
}

export function useDashboardPageMeta() {
  const ctx = useContext(DashboardPageContext);
  if (!ctx) {
    return DEFAULT_META;
  }
  return ctx.meta;
}

/** Call at the top of a dashboard page to set header title/subtitle without remounting the shell. */
export function useSetDashboardPage(meta: DashboardPageMeta) {
  const setMeta = useContext(DashboardPageContext)?.setMeta;
  const { title, subtitle, fullWidthContent } = meta;
  useLayoutEffect(() => {
    setMeta?.({ title, subtitle, fullWidthContent });
  }, [setMeta, title, subtitle, fullWidthContent]);
}
