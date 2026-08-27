"use client";

import { useMemo, useState } from "react";
import { LiveWebsiteViewer } from "@/components/website/LiveWebsiteViewer";
import { WebsiteTile } from "@/components/website/WebsiteTile";
import { StatusPill } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import type { DashboardWebsiteCard } from "@/lib/types";

type WebsiteWallProps = {
  cards: DashboardWebsiteCard[];
  selectedWebsiteId: string | null;
  publicView?: boolean;
  isCurrentPic?: (card: DashboardWebsiteCard) => boolean;
  isBackupPic?: (card: DashboardWebsiteCard) => boolean;
  onSelect: (websiteId: string | null) => void;
};

export function WebsiteWall({
  cards,
  selectedWebsiteId,
  publicView = false,
  isCurrentPic,
  isBackupPic,
  onSelect,
}: WebsiteWallProps) {
  const selectedCard = cards.find((card) => card.website.id === selectedWebsiteId) ?? null;
  const [workspaceSearch, setWorkspaceSearch] = useState("");

  const workspaceCards = useMemo(() => {
    const query = workspaceSearch.trim().toLocaleLowerCase();
    const matching = query
      ? cards.filter((card) =>
          `${card.website.name} ${card.website.domain}`.toLocaleLowerCase().includes(query),
        )
      : cards;

    if (selectedCard && !matching.some((card) => card.website.id === selectedCard.website.id)) {
      return [selectedCard, ...matching];
    }
    return matching;
  }, [cards, selectedCard, workspaceSearch]);

  return (
    <section className="website-wall" aria-label="Daftar website">
      {selectedCard ? (
        <div className="live-website-workspace">
          <aside className="live-website-workspace-rail" aria-label="Pilih website">
            <div className="live-website-workspace-rail-heading">
              <div>
                <span className="eyebrow">Website</span>
                <strong>Website terdaftar</strong>
              </div>
              <span>{cards.length}</span>
            </div>
            <label className="live-website-workspace-search">
              <span className="sr-only">Cari website</span>
              <input
                type="search"
                value={workspaceSearch}
                onChange={(event) => setWorkspaceSearch(event.target.value)}
                placeholder="Cari website"
              />
            </label>
            <div className="live-website-workspace-site-list">
              {workspaceCards.map((card) => {
                const status = card.latest_result?.status ?? "unknown";
                const active = card.website.id === selectedCard.website.id;
                return (
                  <button
                    key={card.website.id}
                    type="button"
                    className={`live-website-workspace-site${active ? " active" : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSelect(card.website.id)}
                  >
                    <span className="live-website-workspace-site-heading">
                      <strong>{card.website.name}</strong>
                      <span>{card.website.domain}</span>
                    </span>
                    <StatusPill status={status} />
                    <small>
                      {card.latest_result
                        ? `Dicek ${formatRelative(card.latest_result.checked_at)}`
                        : "Belum pernah dicek"}
                    </small>
                  </button>
                );
              })}
              {workspaceCards.length === 0 ? (
                <p className="live-website-workspace-empty">Website tidak ditemukan.</p>
              ) : null}
            </div>
          </aside>

          <div className="live-website-workspace-main">
            <label className="live-website-mobile-selector">
              <span>Website aktif</span>
              <select
                className="live-website-site-select"
                value={selectedCard.website.id}
                onChange={(event) => onSelect(event.target.value)}
              >
                {cards.map((card) => (
                  <option key={card.website.id} value={card.website.id}>
                    {card.website.name} · {card.website.domain}
                  </option>
                ))}
              </select>
            </label>
            <LiveWebsiteViewer
              key={selectedCard.website.id}
              website={selectedCard.website}
              publicView={publicView}
              workspace
              onClose={() => onSelect(null)}
            />
          </div>
        </div>
      ) : null}

      {!selectedCard ? (
        <div className="website-wall-grid">
          {cards.map((card) => (
            <WebsiteTile
              key={card.website.id}
              card={card}
              selected={card.website.id === selectedWebsiteId}
              publicView={publicView}
              isCurrentPic={isCurrentPic?.(card)}
              isBackupPic={isBackupPic?.(card)}
              onSelect={() => onSelect(card.website.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
