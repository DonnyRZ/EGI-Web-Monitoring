"use client";

import Link from "next/link";
import { IconExternal } from "@/components/icons";
import { StatusPill } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import type { DashboardWebsiteCard } from "@/lib/types";
import { normalizeLiveWebsiteUrl } from "@/lib/website-experience";

type WebsiteTileProps = {
  card: DashboardWebsiteCard;
  selected?: boolean;
  publicView?: boolean;
  isCurrentPic?: boolean;
  isBackupPic?: boolean;
  onSelect: () => void;
};

export function WebsiteTile({
  card,
  selected = false,
  publicView = false,
  isCurrentPic = false,
  isBackupPic = false,
  onSelect,
}: WebsiteTileProps) {
  const { website, latest_result: latestResult } = card;
  const status = latestResult?.status ?? "unknown";
  const liveUrl = normalizeLiveWebsiteUrl(website.url);

  return (
    <article className={`website-tile${selected ? " selected" : ""}`}>
      <button
        type="button"
        className="website-tile-select"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="website-tile-heading">
          <span className="website-tile-name">{website.name}</span>
          <span className="website-tile-domain" title={website.domain}>{website.domain}</span>
        </span>
        <StatusPill status={status} />
      </button>

      <div className="website-tile-health">
        <span className="website-tile-check">
          {latestResult ? `Dicek ${formatRelative(latestResult.checked_at)}` : "Belum pernah dicek"}
        </span>
        {card.active_incident && !publicView ? (
          <span className="priority-tag high">Incident aktif</span>
        ) : null}
        {!publicView && isCurrentPic ? <span className="priority-tag">Anda PIC</span> : null}
        {!publicView && isBackupPic ? <span className="priority-tag">Anda backup PIC</span> : null}
      </div>

      <div className="website-tile-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={onSelect}>
          Buka Tampilan
        </button>
        {liveUrl ? (
          <a
            className="btn btn-sm btn-neutral"
            href={liveUrl.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconExternal />
            Tab baru
          </a>
        ) : null}
        {!publicView ? (
          <Link className="website-tile-health-link" href={`/websites/${website.id}?tab=health`}>
            Lihat kesehatan
          </Link>
        ) : null}
      </div>
    </article>
  );
}
