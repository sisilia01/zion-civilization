export const LEADERBOARD_SECTION_ID = "zion-leaderboard-section";

const SCROLL_FLAG = "zion-scroll-leaderboard";

export function scrollToLeaderboardSection(behavior: ScrollBehavior = "smooth") {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById(LEADERBOARD_SECTION_ID)?.scrollIntoView({
        behavior,
        block: "start",
      });
    });
  });
}

export function markLeaderboardScrollPending() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SCROLL_FLAG, "1");
  }
}

export function consumeLeaderboardScrollPending(): boolean {
  if (typeof window === "undefined") return false;
  const pending = sessionStorage.getItem(SCROLL_FLAG) === "1";
  if (pending) sessionStorage.removeItem(SCROLL_FLAG);
  return pending;
}

/** Unified wallet-menu Leaderboard action for ZionHome and app/page.tsx. */
export function openLeaderboardFromWalletMenu(options: {
  pathname: string;
  router: { push: (href: string) => void };
  setActiveTab?: (tab: "leaderboard") => void;
}) {
  const { pathname, router, setActiveTab } = options;

  if (pathname === "/leaderboard") {
    scrollToLeaderboardSection();
    return;
  }

  if (pathname === "/" && setActiveTab) {
    setActiveTab("leaderboard");
    scrollToLeaderboardSection();
    return;
  }

  markLeaderboardScrollPending();
  router.push("/leaderboard");
}
