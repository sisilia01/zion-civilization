"use client";

import { createContext, useContext, type ReactNode } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ZionTabContextValue = Record<string, any>;

const ZionTabContext = createContext<ZionTabContextValue | null>(null);

export function ZionTabProvider({
  value,
  children,
}: {
  value: ZionTabContextValue;
  children: ReactNode;
}) {
  return <ZionTabContext.Provider value={value}>{children}</ZionTabContext.Provider>;
}

export function useZionTab<T extends ZionTabContextValue = ZionTabContextValue>(): T {
  const ctx = useContext(ZionTabContext);
  if (!ctx) {
    throw new Error("useZionTab must be used within ZionTabProvider");
  }
  return ctx as T;
}
