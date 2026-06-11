import type { TabId } from "@/lib/tab-routes";
import { ZionHome } from "@/components/zion/ZionHome";

export function ZionPage({ activeTab }: { activeTab: TabId }) {
  return <ZionHome activeTab={activeTab} />;
}
