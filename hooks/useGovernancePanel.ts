"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { filterGovernanceBranchLog } from "@/lib/governanceActivityLog";
import {
  cleanActivityDescription,
  filterGovernanceParties,
  presidentPartyDisplay,
} from "@/lib/governanceFormat";

type ActivityRow = { description: string; created_at: string; event_type?: string };

export function useGovernancePanel() {
  const [isMobile, setIsMobile] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [governanceHeader, setGovernanceHeader] = useState<{
    amendments_in_voting: number;
  } | null>(null);
  const [presidentState, setPresidentState] = useState<Record<string, unknown> | null>(null);
  const [sheriffState, setSheriffState] = useState<Record<string, unknown> | null>(null);
  const [frsChief, setFrsChief] = useState<{
    name: string;
    confirmed: boolean;
    term_days: number;
    days_remaining: number;
    progress_pct: number;
  } | null>(null);
  const [frsStats, setFrsStats] = useState<Record<string, unknown> | null>(null);
  const [stateTreasury, setStateTreasury] = useState<Record<string, unknown> | null>(null);
  const [ecoPolData, setEcoPolData] = useState<Record<string, unknown> | null>(null);
  const [politicalEconomy, setPoliticalEconomy] = useState<Record<string, unknown> | null>(null);
  const [partiesData, setPartiesData] = useState<Array<Record<string, unknown>>>([]);
  const [senateData, setSenateData] = useState<{
    senators: Array<Record<string, unknown>>;
  } | null>(null);
  const [presidentActions, setPresidentActions] = useState<ActivityRow[]>([]);
  const [sheriffActions, setSheriffActions] = useState<ActivityRow[]>([]);
  const [senateEvents, setSenateEvents] = useState<ActivityRow[]>([]);
  const [senateActions, setSenateActions] = useState<ActivityRow[]>([]);
  const [zrsEvents, setZrsEvents] = useState<ActivityRow[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const fetchEcoPol = useCallback(async () => {
    try {
      const res = await fetch(`/api/eco-pol?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const president = data.president;
      if (president?.agent_name) {
        setPresidentState({
          agent_name: president.agent_name,
          party: president.party ?? "reform",
          approval_rating: Number(president.approval_rating) || 50,
          personal_fund: Number(president.personal_fund) || 0,
          corruption_index: Number(president.corruption_index) || 0,
          term_days: Number(president.term_days ?? president.term_limit_days) || 3,
          days_remaining: Number(president.days_remaining ?? president.term_days ?? 3),
          progress_pct: Number(president.progress_pct) || 0,
        });
      }
      if (data.sheriff?.agent_name && data.sheriff.agent_name !== "No Sheriff") {
        const sheriff = data.sheriff;
        setSheriffState({
          ...sheriff,
          term_days: Number(sheriff.term_days) || 3,
          days_remaining: Number(sheriff.days_remaining ?? sheriff.term_days ?? 3),
          progress_pct: Number(sheriff.progress_pct) || 0,
        });
      } else {
        setSheriffState(null);
      }
      const zrs = data.zrs_last_action;
      const corps = data.corporations ?? {};
      const economy = data.economy ?? {};
      setEcoPolData({
        zrs_last_action: zrs ?? null,
        corporations: {
          active: Number(corps.active) || 0,
          total_treasury: Number(corps.total_treasury) || 0,
        },
        economy: {
          avg_balance: Number(economy.avg_balance) || 0,
          poverty_pct: Number(economy.poverty_pct) || 0,
          crime_pct: Number(economy.crime_pct) || 0,
          crime_rate: Number(economy.crime_rate) || 0,
          unemployment_rate: Number(economy.unemployment_rate) || 0,
          gini_coefficient: Number(economy.gini_coefficient) || 0,
          total_zion: Number(economy.total_zion) || 0,
        },
        active_effects: Array.isArray(data.active_effects) ? data.active_effects : [],
        uprising: data.uprising ?? { active: false, meter: 0 },
        epidemic: data.epidemic ?? { active: false, infected_count: 0 },
      });
      if (data.frs_chief && typeof data.frs_chief === "object") {
        setFrsChief({
          name: String(data.frs_chief.name ?? "Vacant"),
          confirmed: Boolean(data.frs_chief.confirmed),
          term_days: Number(data.frs_chief.term_days ?? data.frs_chief.max_cycles) || 6,
          days_remaining: Number(data.frs_chief.days_remaining ?? 0),
          progress_pct: Number(data.frs_chief.progress_pct) || 0,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchGovernmentData = useCallback(async () => {
    try {
      const [senateRes, partiesRes] = await Promise.all([
        fetch(`/senate?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/political_parties?t=${Date.now()}`, { cache: "no-store" }),
      ]);
      if (senateRes.ok) {
        const d = await senateRes.json();
        setSenateData({
          senators: Array.isArray(d?.senators) ? d.senators : [],
        });
      }
      if (partiesRes.ok) {
        const d = await partiesRes.json();
        setPartiesData(filterGovernanceParties(Array.isArray(d) ? d : []));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchPoliticalEconomy = useCallback(async () => {
    try {
      const [crisisRes, powerRes] = await Promise.all([
        fetch(`/api/crisis_state?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/power_balance?t=${Date.now()}`, { cache: "no-store" }),
      ]);
      const crisisPayload = crisisRes.ok ? await crisisRes.json() : null;
      const powerPayload = powerRes.ok ? await powerRes.json() : null;
      setPoliticalEconomy({
        crisis: crisisPayload?.crisis ?? {},
        metrics: crisisPayload?.metrics ?? {},
        power: { scores: powerPayload?.scores ?? {} },
      });
    } catch {
      /* ignore */
    }
  }, []);

  const fetchActivityLogs = useCallback(async () => {
    const [presRes, sherRes, senRes, zrsRes] = await Promise.all([
      fetch("/api/president-activity", { cache: "no-store" }),
      fetch("/api/sheriff-activity", { cache: "no-store" }),
      fetch("/api/senate-activity", { cache: "no-store" }),
      fetch("/api/zrs-activity", { cache: "no-store" }),
    ]);
    try {
      const pres = await presRes.json();
      if (Array.isArray(pres)) setPresidentActions(pres);
    } catch {
      /* ignore */
    }
    try {
      const sher = await sherRes.json();
      if (Array.isArray(sher)) setSheriffActions(sher);
    } catch {
      /* ignore */
    }
    try {
      const sen = await senRes.json();
      const senateList = Array.isArray(sen) ? sen : Array.isArray(sen?.actions) ? sen.actions : [];
      setSenateActions(senateList);
      setSenateEvents(
        senateList.map((e: ActivityRow) => ({
          description: String(e.description ?? ""),
          created_at: String(e.created_at ?? ""),
          event_type: String(e.event_type ?? "senate"),
        })),
      );
    } catch {
      setSenateActions([]);
      setSenateEvents([]);
    }
    try {
      const zrs = await zrsRes.json();
      const zrsList = Array.isArray(zrs) ? zrs : Array.isArray(zrs?.actions) ? zrs.actions : [];
      setZrsEvents(
        zrsList.map((e: ActivityRow) => ({
          description: String(e.description ?? ""),
          created_at: String(e.created_at ?? ""),
          event_type: String(e.event_type ?? "zrs"),
        })),
      );
    } catch {
      setZrsEvents([]);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await Promise.all([
        fetchEcoPol(),
        fetchGovernmentData(),
        fetchPoliticalEconomy(),
        fetchActivityLogs(),
      ]);
    };
    void load();
    const id = setInterval(() => void load(), 60_000);
    fetch("/api/state/treasury")
      .then((r) => r.json())
      .then((d) => setStateTreasury(d))
      .catch(() => {});
    fetch("/api/frs/stats")
      .then((r) => r.json())
      .then((d) => setFrsStats(d))
      .catch(() => {});
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
    fetch("/api/governance/header")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.amendments_in_voting !== "undefined") {
          setGovernanceHeader({
            amendments_in_voting: Number(d.amendments_in_voting) || 0,
          });
        }
      })
      .catch(() => {});
    return () => clearInterval(id);
  }, [fetchActivityLogs, fetchEcoPol, fetchGovernmentData, fetchPoliticalEconomy]);

  const peCrimeRate = useMemo(() => {
    const economy = (ecoPolData?.economy ?? {}) as Record<string, number>;
    const metrics = (politicalEconomy?.metrics ?? {}) as Record<string, number>;
    const crisis = (politicalEconomy?.crisis ?? {}) as Record<string, number>;
    const gangPct = economy.crime_pct ?? stats?.crime_pct ?? metrics.gang_crime_pct ?? 0;
    if (gangPct > 0) return gangPct > 1 ? gangPct / 100 : gangPct;
    const raw = metrics.crime_rate ?? crisis.crime_rate ?? stats?.crime_rate ?? 0;
    return raw > 1 ? raw / 100 : raw;
  }, [ecoPolData, stats, politicalEconomy]);

  const peGini = useMemo(() => {
    const economy = (ecoPolData?.economy ?? {}) as Record<string, number>;
    const metrics = (politicalEconomy?.metrics ?? {}) as Record<string, number>;
    const crisis = (politicalEconomy?.crisis ?? {}) as Record<string, number>;
    return (
      economy.gini_coefficient ??
      stats?.gini_coefficient ??
      metrics.gini_coefficient ??
      crisis.gini_coefficient ??
      0
    );
  }, [ecoPolData, stats, politicalEconomy]);

  const peUnemployment = useMemo(() => {
    const economy = (ecoPolData?.economy ?? {}) as Record<string, number>;
    const metrics = (politicalEconomy?.metrics ?? {}) as Record<string, number>;
    const crisis = (politicalEconomy?.crisis ?? {}) as Record<string, number>;
    return (
      economy.unemployment_rate ??
      stats?.unemployment_rate ??
      metrics.unemployment_rate ??
      crisis.unemployment_rate ??
      0
    );
  }, [ecoPolData, stats, politicalEconomy]);

  const ecoPolTickerMessages = useMemo(() => {
    const items: { text: string; breaking?: boolean }[] = [];
    const crisis = (politicalEconomy?.crisis ?? {}) as Record<string, unknown>;
    const metrics = (politicalEconomy?.metrics ?? {}) as Record<string, unknown>;
    const economy = (ecoPolData?.economy ?? {}) as Record<string, number>;
    const uprising = (ecoPolData?.uprising ?? {}) as Record<string, number | boolean>;

    if (crisis.is_active) {
      const pname = metrics.president_name ?? presidentState?.agent_name ?? "President";
      items.push({ text: `🚨 STATE OF EMERGENCY declared by ${pname}`, breaking: true });
    }
    const revPressure = Number(metrics.revolution_pressure ?? crisis.revolution_pressure ?? 0);
    if (revPressure > 50) {
      items.push({
        text: `Civil unrest pressure rising: ${Math.round(revPressure)}/150`,
        breaking: revPressure > 100,
      });
    }
    const ecoPhase = String(metrics.economic_phase ?? crisis.economic_phase ?? "NORMAL").toUpperCase();
    if (ecoPhase !== "NORMAL") {
      items.push({ text: `📊 Economy in ${ecoPhase}`, breaking: ecoPhase === "DEPRESSION" });
    }
    if (uprising.active) {
      items.push({
        text: `UPRISING ACTIVE — Civil unrest index ${uprising.meter ?? 0}%`,
        breaking: true,
      });
    }
    if (presidentState) {
      const partyUi = presidentPartyDisplay(String(presidentState.party ?? ""));
      items.push({
        text: `🏛️ President ${presidentState.agent_name} · ${partyUi.label} · ${presidentState.approval_rating}% approval`,
      });
    }
    if (items.length === 0) {
      items.push({ text: "LIVE ECO-POL FEED" });
    }
    return items;
  }, [ecoPolData, politicalEconomy, presidentState]);

  const sheriffActionsDisplay = useMemo(
    () => filterGovernanceBranchLog(sheriffActions, "sheriff", cleanActivityDescription).slice(0, 5),
    [sheriffActions],
  );

  const senateEventsDisplay = useMemo(() => {
    const items =
      senateEvents.length > 0
        ? senateEvents
        : senateActions.map((e) => ({ ...e, event_type: "senate" as const }));
    return filterGovernanceBranchLog(items, "senate", cleanActivityDescription).slice(0, 8);
  }, [senateEvents, senateActions]);

  const zrsEventsDisplay = useMemo(
    () => filterGovernanceBranchLog(zrsEvents, "zrs", cleanActivityDescription).slice(0, 8),
    [zrsEvents],
  );

  const presidentActionsDisplay = useMemo(() => {
    const filtered = filterGovernanceBranchLog(presidentActions, "president", cleanActivityDescription);
    return filtered
      .reduce<Array<ActivityRow & { count: number }>>((acc, entry) => {
        const last = acc[acc.length - 1];
        if (last && last.description === entry.description) {
          last.count += 1;
        } else {
          acc.push({ ...entry, count: 1 });
        }
        return acc;
      }, [])
      .slice(0, 5);
  }, [presidentActions]);

  return {
    isMobile,
    stats,
    governanceHeader,
    presidentState,
    sheriffState,
    frsChief,
    frsStats,
    stateTreasury,
    ecoPolData,
    politicalEconomy,
    partiesData,
    senateData,
    peCrimeRate,
    peGini,
    peUnemployment,
    ecoPolTickerMessages,
    presidentActionsDisplay,
    sheriffActionsDisplay,
    senateEventsDisplay,
    zrsEventsDisplay,
  };
}
