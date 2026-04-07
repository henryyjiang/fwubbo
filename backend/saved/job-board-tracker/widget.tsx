import React, { useState, useMemo } from "react";
import { Briefcase, MapPin, Clock, ExternalLink, Search, AlertCircle, Building2 } from "lucide-react";

interface Job {
  company: string;
  company_id: string;
  title: string;
  location: string;
  posted_raw: string;
  url: string;
}

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const COMPANY_COLORS: Record<string, string> = {
  apple:      "bg-surface-overlay text-text-primary",
  nvidia:     "bg-surface-overlay text-status-ok",
  salesforce: "bg-surface-overlay text-accent-primary",
  adobe:      "bg-surface-overlay text-status-error",
  snap:       "bg-surface-overlay text-status-warn",
  paypal:     "bg-surface-overlay text-accent-secondary",
  qualcomm:   "bg-surface-overlay text-accent-primary",
  intuit:     "bg-surface-overlay text-status-ok",
  autodesk:   "bg-surface-overlay text-status-warn",
  zendesk:    "bg-surface-overlay text-status-ok",
  box:        "bg-surface-overlay text-accent-secondary",
  twilio:     "bg-surface-overlay text-status-error",
  workday:    "bg-surface-overlay text-accent-primary",
  vmware:     "bg-surface-overlay text-accent-secondary",
  ebay:       "bg-surface-overlay text-status-warn",
};

function PostedBadge({ raw }: { raw: string }) {
  const lower = raw.toLowerCase();
  const isToday = lower.includes("today");
  return (
    <span className={`text-[10px] font-mono ${isToday ? "text-status-ok" : "text-text-muted"}`}>
      {isToday ? "today" : raw.replace("Posted ", "").replace(" Ago", "").toLowerCase()}
    </span>
  );
}

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  const [filter, setFilter] = useState("");

  if (loading) {
    return (
      <div className="h-full flex flex-col gap-2 p-3 animate-pulse">
        <div className="h-8 bg-surface-raised rounded-lg w-full" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-14 bg-surface-raised rounded-lg w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
        <AlertCircle size={24} className="text-status-error" />
        <p className="text-text-secondary text-sm text-center">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const jobs: Job[] = data.jobs || [];
  const keywords: string = data.keywords || "";
  const filterLower = filter.toLowerCase();

  const filtered = useMemo(() => {
    if (!filterLower) return jobs;
    return jobs.filter(j =>
      j.title.toLowerCase().includes(filterLower) ||
      j.company.toLowerCase().includes(filterLower) ||
      j.location.toLowerCase().includes(filterLower)
    );
  }, [jobs, filterLower]);

  const hasErrors = data.fetch_errors && Object.keys(data.fetch_errors).length > 0;

  return (
    <div className="h-full flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 flex-shrink-0">
        <span className="text-xs font-mono text-accent-primary bg-surface-raised px-2 py-0.5 rounded-full border border-border-subtle">
          {keywords}
        </span>
        <span className="text-xs text-text-muted ml-auto">
          {filtered.length}/{data.total ?? jobs.length} jobs
        </span>
        {hasErrors && (
          <span className="text-[10px] text-status-warn" title={`Errors: ${Object.keys(data.fetch_errors).join(", ")}`}>
            ⚠ {Object.keys(data.fetch_errors).length} failed
          </span>
        )}
      </div>

      {/* Search filter */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-lg px-2 py-1">
          <Search size={12} className="text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Filter by title, company, location…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none w-full"
          />
        </div>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-1.5 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Building2 size={28} className="text-text-muted" />
            <p className="text-text-muted text-sm">
              {filter ? "No matches for your filter" : "No jobs found"}
            </p>
            {data.location_filter && (
              <p className="text-text-muted text-xs">Location filter: "{data.location_filter}"</p>
            )}
          </div>
        ) : (
          filtered.map((job, i) => (
            <div
              key={`${job.company_id}-${i}`}
              className="bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 flex items-start gap-2 group cursor-pointer hover:border-accent-primary transition-colors"
              onClick={() => job.url && window.open(job.url, "_blank")}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-border-subtle ${COMPANY_COLORS[job.company_id] || "bg-surface-overlay text-text-secondary"}`}>
                    {job.company}
                  </span>
                  {job.posted_raw && <PostedBadge raw={job.posted_raw} />}
                </div>
                <p className="text-sm font-body text-text-primary truncate leading-snug">{job.title}</p>
                {job.location && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin size={10} className="text-text-muted flex-shrink-0" />
                    <span className="text-[10px] text-text-muted truncate">{job.location}</span>
                  </div>
                )}
              </div>
              <ExternalLink size={12} className="text-text-muted group-hover:text-accent-primary transition-colors flex-shrink-0 mt-1" />
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {lastUpdated && (
        <div className="px-3 py-1 border-t border-border-subtle flex-shrink-0">
          <span className="text-[10px] text-text-muted">
            {data.companies_ok}/{data.companies_queried} sources · refreshed {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
    </div>
  );
}
