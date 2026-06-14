"use client";

import { Press } from "@/components/tabs/Press";
import { ZionTabProvider } from "@/components/zion/ZionTabContext";
import { usePressPanel } from "@/hooks/usePressPanel";

export function PressPanel() {
  const ctx = usePressPanel();
  return (
    <ZionTabProvider value={ctx}>
      <Press />
    </ZionTabProvider>
  );
}
