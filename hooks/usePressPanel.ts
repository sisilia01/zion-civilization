"use client";

import { useConnectWallet, useCurrentAccount, useWallets } from "@mysten/dapp-kit";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  newspapers,
  PRESS_CACHE_TTL_MS,
  type PressNewspaper,
} from "@/lib/press/data";
import { parsePressStats } from "@/lib/press/parseStats";
import { renderArticle } from "@/lib/press/renderArticle";

export function usePressPanel() {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const { mutate: connectWallet } = useConnectWallet();

  const [isMobile, setIsMobile] = useState(false);
  const [pressArticles, setPressArticles] = useState<Record<string, string>>({});
  const [pressLoading, setPressLoading] = useState<Record<string, boolean>>({});
  const [activeNewspaper, setActiveNewspaper] = useState("ziontimes");
  const [suiBalance, setSuiBalance] = useState(0);
  const [pressSuiChecked, setPressSuiChecked] = useState(false);

  const connect = useCallback(() => {
    const w = wallets[0];
    if (w) connectWallet({ wallet: w });
  }, [connectWallet, wallets]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const checkVipStatus = useCallback(async () => {
    if (!account?.address) return;
    try {
      const res = await fetch("https://fullnode.testnet.sui.io", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getBalance",
          params: [account.address, "0x2::sui::SUI"],
        }),
      });
      const data = (await res.json()) as { result?: { totalBalance?: string } };
      const balance = parseInt(data.result?.totalBalance || "0", 10) / 1e9;
      setSuiBalance(balance);
    } catch {
      setSuiBalance(0);
    } finally {
      setPressSuiChecked(true);
    }
  }, [account?.address]);

  useEffect(() => {
    if (account?.address) {
      setPressSuiChecked(false);
      void checkVipStatus();
    } else {
      setSuiBalance(0);
      setPressSuiChecked(false);
    }
  }, [account?.address, checkVipStatus]);

  const vipCanRead = useMemo(() => {
    const vipPaper = newspapers.find((n) => n.id === "vip");
    const silverMin = vipPaper?.silverMin ?? 0.1;
    return Boolean(account?.address && pressSuiChecked && suiBalance >= silverMin);
  }, [account?.address, pressSuiChecked, suiBalance]);

  const generateArticle = useCallback(async (newspaper: PressNewspaper) => {
    try {
      const serverRes = await fetch(`/api/press/${newspaper.id}`);
      const serverData = await serverRes.json();
      if (serverData.cached && serverData.content) {
        setPressArticles((prev) => ({ ...prev, [newspaper.id]: serverData.content }));
        localStorage.setItem(
          `press_${newspaper.id}`,
          JSON.stringify({ content: serverData.content, ts: Date.now() }),
        );
        return;
      }
    } catch {
      /* ignore */
    }

    try {
      const pressCache = localStorage.getItem(`press_${newspaper.id}`);
      if (pressCache) {
        const { content, ts } = JSON.parse(pressCache) as { content: string; ts: number };
        if (Date.now() - ts < PRESS_CACHE_TTL_MS) {
          setPressArticles((prev) => ({ ...prev, [newspaper.id]: content }));
          return;
        }
      }
    } catch {
      /* ignore */
    }

    setPressLoading((prev) => ({ ...prev, [newspaper.id]: true }));
    try {
      const [eventsRes, statsRes] = await Promise.all([
        fetch("/api/events?limit=20"),
        fetch("/api/stats"),
      ]);
      const eventsRaw = await eventsRes.json();
      const stats = (await statsRes.json()) as Record<string, unknown>;

      type EvRow = { type?: string; description?: string; amount?: number };
      const events: EvRow[] = Array.isArray(eventsRaw)
        ? (eventsRaw as EvRow[])
        : Array.isArray((eventsRaw as { events?: EvRow[] }).events)
          ? (eventsRaw as { events: EvRow[] }).events
          : [];

      const tLower = (s: string | undefined) => (s ?? "").toLowerCase();
      const relevantEvents = events
        .filter(
          (e) =>
            newspaper.relevantTypes.some(
              (rt) => tLower(e.type) === rt || tLower(e.type).includes(rt),
            ) ||
            newspaper.keywords.some((k) => tLower(e.description).includes(k.toLowerCase())),
        )
        .slice(0, 8);

      const parsedStats = parsePressStats(stats);

      const aiRes = await fetch("/api/generate_press", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newspaper_id: newspaper.id,
          persona: newspaper.persona,
          relevant_events:
            relevantEvents.map((e) => `[${e.type}] ${e.description}`).join("\n") ||
            "- Civilization continues its eternal struggle",
          alive: parsedStats.alive,
          deaths_today: parsedStats.deaths_today,
          total_zion: parsedStats.total_zion,
          active_clans: parsedStats.active_clans,
        }),
      });
      const aiData = (await aiRes.json()) as { content?: string };
      const content = aiData.content ?? "";

      if (content) {
        setPressArticles((prev) => ({ ...prev, [newspaper.id]: content }));
        fetch(`/api/press/${newspaper.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }).catch(() => {});
        localStorage.setItem(
          `press_${newspaper.id}`,
          JSON.stringify({ content, ts: Date.now() }),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setPressLoading((prev) => ({ ...prev, [newspaper.id]: false }));
    }
  }, []);

  useEffect(() => {
    newspapers.forEach((newspaper) => {
      if (!newspaper.vipOnly) {
        void generateArticle(newspaper);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount
  }, []);

  useEffect(() => {
    if (
      activeNewspaper === "vip" &&
      vipCanRead &&
      !pressArticles["vip"] &&
      !pressLoading["vip"]
    ) {
      const vipPaper = newspapers.find((n) => n.id === "vip");
      if (vipPaper) void generateArticle(vipPaper);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- VIP when access granted
  }, [activeNewspaper, vipCanRead]);

  return {
    newspapers,
    activeNewspaper,
    pressArticles,
    pressLoading,
    account,
    pressSuiChecked,
    suiBalance,
    setActiveNewspaper,
    renderArticle,
    isMobile,
    connect,
    vipCanRead,
  };
}
