"use client";

import { useConnectWallet, useCurrentAccount, useWallets } from "@mysten/dapp-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  newspapers,
  isPressCacheValidForToday,
  type PressNewspaper,
} from "@/lib/press/data";
import { parsePressStats } from "@/lib/press/parseStats";
import { renderArticle } from "@/lib/press/renderArticle";

type PressServerPayload = {
  content?: string;
  cached?: boolean;
  is_today?: boolean;
  fallback?: boolean;
  notice?: string;
  error?: string;
};

const YESTERDAY_NOTICE =
  "Today's edition is being prepared — showing the most recent available issue.";

export function usePressPanel() {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const { mutate: connectWallet } = useConnectWallet();

  const [isMobile, setIsMobile] = useState(false);
  const [pressArticles, setPressArticles] = useState<Record<string, string>>({});
  const [pressLoading, setPressLoading] = useState<Record<string, boolean>>({});
  const [pressNotice, setPressNotice] = useState<Record<string, string>>({});
  const [pressErrors, setPressErrors] = useState<Record<string, string>>({});
  const [activeNewspaper, setActiveNewspaper] = useState("ziontimes");
  const [suiBalance, setSuiBalance] = useState(0);
  const [pressSuiChecked, setPressSuiChecked] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

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

  const storeArticle = useCallback((newspaperId: string, content: string) => {
    setPressArticles((prev) => ({ ...prev, [newspaperId]: content }));
    localStorage.setItem(
      `press_${newspaperId}`,
      JSON.stringify({ content, ts: Date.now() }),
    );
  }, []);

  const generateArticle = useCallback(
    async (newspaper: PressNewspaper) => {
      if (inFlight.current.has(newspaper.id)) return;
      inFlight.current.add(newspaper.id);

      try {
        let hasDisplayContent = false;

        try {
          const serverRes = await fetch(`/api/press/${newspaper.id}`);
          if (serverRes.ok) {
            const serverData = (await serverRes.json()) as PressServerPayload;
            if (serverData.cached && serverData.content) {
              storeArticle(newspaper.id, serverData.content);
              hasDisplayContent = true;
              setPressErrors((prev) => {
                const next = { ...prev };
                delete next[newspaper.id];
                return next;
              });

              if (serverData.is_today) {
                setPressNotice((prev) => {
                  const next = { ...prev };
                  delete next[newspaper.id];
                  return next;
                });
                return;
              }

              setPressNotice((prev) => ({
                ...prev,
                [newspaper.id]: serverData.notice ?? YESTERDAY_NOTICE,
              }));
            }
          } else {
            console.warn(`Press GET failed for ${newspaper.id}: HTTP ${serverRes.status}`);
          }
        } catch (err) {
          console.warn(`Press cache fetch failed for ${newspaper.id}`, err);
        }

        if (!hasDisplayContent) {
          try {
            const pressCache = localStorage.getItem(`press_${newspaper.id}`);
            if (pressCache) {
              const { content, ts } = JSON.parse(pressCache) as { content: string; ts: number };
              if (typeof content === "string" && content.length > 0) {
                storeArticle(newspaper.id, content);
                hasDisplayContent = true;
                if (isPressCacheValidForToday(ts)) {
                  return;
                }
                setPressNotice((prev) => ({
                  ...prev,
                  [newspaper.id]: YESTERDAY_NOTICE,
                }));
              }
            }
          } catch (err) {
            console.warn(`Press localStorage read failed for ${newspaper.id}`, err);
          }
        }

        const backgroundRefresh = hasDisplayContent;
        if (!backgroundRefresh) {
          setPressLoading((prev) => ({ ...prev, [newspaper.id]: true }));
        }

        try {
          const statsRes = await fetch("/api/stats");
          if (!statsRes.ok) {
            throw new Error(`Stats request failed (${statsRes.status})`);
          }
          const stats = (await statsRes.json()) as Record<string, unknown>;
          const parsedStats = parsePressStats(stats);

          const aiRes = await fetch("/api/generate_press", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              newspaper_id: newspaper.id,
              persona: newspaper.persona,
              relevant_types: newspaper.relevantTypes,
              keywords: newspaper.keywords,
              alive: parsedStats.alive,
              deaths_today: parsedStats.deaths_today,
              total_zion: parsedStats.total_zion,
              active_clans: parsedStats.active_clans,
            }),
          });

          const aiData = (await aiRes.json()) as PressServerPayload;
          const content = aiData.content ?? "";

          if (content) {
            storeArticle(newspaper.id, content);
            setPressErrors((prev) => {
              const next = { ...prev };
              delete next[newspaper.id];
              return next;
            });

            if (aiData.is_today === false || aiData.fallback) {
              setPressNotice((prev) => ({
                ...prev,
                [newspaper.id]: aiData.notice ?? YESTERDAY_NOTICE,
              }));
            } else {
              setPressNotice((prev) => {
                const next = { ...prev };
                delete next[newspaper.id];
                return next;
              });
              if (!aiData.cached) {
                fetch(`/api/press/${newspaper.id}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                }).catch((err) => {
                  console.warn(`Press save failed for ${newspaper.id}`, err);
                });
              }
            }
          } else if (!hasDisplayContent) {
            const message =
              aiData.error ??
              aiData.notice ??
              "Unable to load today's edition. Please try again later.";
            setPressErrors((prev) => ({ ...prev, [newspaper.id]: message }));
          }
        } catch (err) {
          if (!hasDisplayContent) {
            const message =
              err instanceof Error ? err.message : "Failed to load the daily edition.";
            setPressErrors((prev) => ({ ...prev, [newspaper.id]: message }));
          }
          console.error(`Press generation failed for ${newspaper.id}`, err);
        } finally {
          if (!backgroundRefresh) {
            setPressLoading((prev) => ({ ...prev, [newspaper.id]: false }));
          }
        }
      } finally {
        inFlight.current.delete(newspaper.id);
      }
    },
    [storeArticle],
  );

  useEffect(() => {
    newspapers.forEach((newspaper) => {
      if (newspaper.vipOnly) return;
      void generateArticle(newspaper);
    });
  }, [generateArticle]);

  useEffect(() => {
    if (!vipCanRead) return;
    const vipPaper = newspapers.find((n) => n.id === "vip");
    if (vipPaper) void generateArticle(vipPaper);
  }, [vipCanRead, generateArticle]);

  return {
    newspapers,
    activeNewspaper,
    pressArticles,
    pressLoading,
    pressNotice,
    pressErrors,
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
