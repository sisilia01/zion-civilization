"use client";

type LiveMetricsBarProps = {
  subjectCount: string;
  mortality24h: string;
  prosperityPct: string;
  amendments: string;
  loading?: boolean;
};

export function LiveMetricsBar({
  subjectCount,
  mortality24h,
  prosperityPct,
  amendments,
  loading = false,
}: LiveMetricsBarProps) {
  return (
    <section className="liveMetricsBar" aria-label="Live experiment metrics">
      <div className="liveMetric">
        <span className="liveMetricLabel">ACTIVE SUBJECTS</span>
        <span className="liveMetricValue">{subjectCount}</span>
      </div>
      <span className="liveMetricDivider" />
      <div className="liveMetric">
        <span className="liveMetricLabel">MORTALITY 24H</span>
        <span className="liveMetricValue">{loading ? "···" : mortality24h}</span>
      </div>
      <span className="liveMetricDivider" />
      <div className="liveMetric">
        <span className="liveMetricLabel">PROSPERITY INDEX</span>
        <span className="liveMetricValue">{prosperityPct}</span>
      </div>
      <span className="liveMetricDivider" />
      <div className="liveMetric">
        <span className="liveMetricLabel">AMENDMENTS</span>
        <span className="liveMetricValue">{amendments}</span>
      </div>
    </section>
  );
}
