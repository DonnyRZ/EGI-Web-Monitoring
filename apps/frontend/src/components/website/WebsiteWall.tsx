"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ResponsiveOverlay } from "@/components/ResponsiveOverlay";
import { IconCheck, IconChevronDown, IconExternal } from "@/components/icons";
import { LiveWebsiteViewer } from "@/components/website/LiveWebsiteViewer";
import { WebsiteTile } from "@/components/website/WebsiteTile";
import { StatusPill } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { normalizeLiveWebsiteUrl } from "@/lib/website-experience";
import type { DashboardWebsiteCard } from "@/lib/types";

type WebsiteWallProps = {
  cards: DashboardWebsiteCard[];
  selectedWebsiteId: string | null;
  publicView?: boolean;
  filterLabel?: string;
  isCurrentPic?: (card: DashboardWebsiteCard) => boolean;
  isBackupPic?: (card: DashboardWebsiteCard) => boolean;
  onSelect: (websiteId: string) => void;
  onClearSelection?: () => void;
};

export function WebsiteWall({
  cards,
  selectedWebsiteId,
  publicView = false,
  filterLabel = "Website aktif",
  isCurrentPic,
  isBackupPic,
  onSelect,
  onClearSelection,
}: WebsiteWallProps) {
  const selectedCard = cards.find((card) => card.website.id === selectedWebsiteId) ?? null;
  // The first valid card prevents a transient card-grid flash while the parent
  // synchronizes the URL/local-storage selection after the first response.
  const activeCard = selectedCard ?? (!publicView ? cards[0] : null);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerSearchRef = useRef<HTMLInputElement | null>(null);

  const workspaceCards = useMemo(() => {
    const query = workspaceSearch.trim().toLocaleLowerCase();
    const matching = query
      ? cards.filter((card) =>
          `${card.website.name} ${card.website.domain}`.toLocaleLowerCase().includes(query),
        )
      : cards;

    if (activeCard && !matching.some((card) => card.website.id === activeCard.website.id)) {
      return [activeCard, ...matching];
    }
    return matching;
  }, [activeCard, cards, workspaceSearch]);

  const pickerCards = useMemo(() => {
    const query = pickerSearch.trim().toLocaleLowerCase();
    const matching = query
      ? cards.filter((card) =>
          `${card.website.name} ${card.website.domain}`.toLocaleLowerCase().includes(query),
        )
      : cards;
    if (activeCard && !matching.some((card) => card.website.id === activeCard.website.id)) {
      return [activeCard, ...matching];
    }
    return matching;
  }, [activeCard, cards, pickerSearch]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerSearch("");
  }, []);

  const selectFromPicker = useCallback((websiteId: string) => {
    onSelect(websiteId);
    closePicker();
  }, [closePicker, onSelect]);

  const activeStatus = activeCard?.latest_result?.status ?? "unknown";
  const activeUrl = activeCard ? normalizeLiveWebsiteUrl(activeCard.website.url) : null;

  return (
    <section className={`website-wall${publicView ? " public-website-wall" : " live-website-wall"}`} aria-label={publicView ? "Daftar website" : "Workspace Live Website"}>
      {activeCard ? (
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
                const active = card.website.id === activeCard.website.id;
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
            <div className="live-website-mobile-control-bar">
              <button
                ref={pickerTriggerRef}
                type="button"
                className="live-website-mobile-selector"
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen(true)}
              >
                <span className="live-website-mobile-selector-copy">
                  <span className="live-website-mobile-selector-label">Website aktif</span>
                  <strong title={activeCard.website.name}>{activeCard.website.name}</strong>
                  <span title={activeCard.website.domain}>{activeCard.website.domain}</span>
                </span>
                <IconChevronDown aria-hidden />
              </button>
              {activeUrl ? (
                <a
                  className="live-website-mobile-open"
                  href={activeUrl.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconExternal />
                  <span>Buka website</span>
                </a>
              ) : null}
              <div className="live-website-mobile-health" aria-label={`Status ${activeCard.website.name}`}>
                <StatusPill status={activeStatus} />
                <span>
                  {activeCard.latest_result
                    ? `Dicek ${formatRelative(activeCard.latest_result.checked_at)}`
                    : "Belum pernah dicek"}
                </span>
              </div>
            </div>
            <LiveWebsiteViewer
              key={activeCard.website.id}
              website={activeCard.website}
              publicView={publicView}
              workspace={!publicView}
              presentation={publicView ? "public-gallery" : "immersive-mobile"}
              onClose={publicView ? onClearSelection : undefined}
            />
          </div>
        </div>
      ) : null}

      {publicView && !activeCard ? (
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

      {!publicView && pickerOpen && activeCard ? (
        <ResponsiveOverlay
          title="Pilih Website"
          eyebrow="Live Website"
          className="live-website-picker"
          onClose={closePicker}
          returnFocusRef={pickerTriggerRef}
          initialFocusRef={pickerSearchRef}
          footer={<button type="button" className="btn btn-neutral" onClick={closePicker}>Tutup</button>}
        >
          <label className="live-website-picker-search">
            <span className="sr-only">Cari nama atau domain website</span>
            <input
              ref={pickerSearchRef}
              type="search"
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
              placeholder="Cari nama atau domain"
            />
          </label>
          <div className="live-website-picker-meta">
            <span>{pickerCards.length} website</span>
            <span className="live-website-picker-filter">{filterLabel}</span>
          </div>
          <div className="live-website-picker-list" aria-label="Daftar website">
            {pickerCards.map((card) => {
              const active = card.website.id === activeCard.website.id;
              const status = card.latest_result?.status ?? "unknown";
              return (
                <button
                  key={card.website.id}
                  type="button"
                  aria-pressed={active}
                  className={`live-website-picker-option${active ? " active" : ""}`}
                  onClick={() => selectFromPicker(card.website.id)}
                >
                  <span className="live-website-picker-option-copy">
                    <strong>{card.website.name}</strong>
                    <span>{card.website.domain}</span>
                    <small>
                      {card.latest_result
                        ? `Dicek ${formatRelative(card.latest_result.checked_at)}`
                        : "Belum pernah dicek"}
                    </small>
                  </span>
                  <span className="live-website-picker-option-side">
                    <StatusPill status={status} />
                    {active ? <IconCheck aria-hidden /> : null}
                  </span>
                </button>
              );
            })}
            {pickerCards.length === 0 ? <p className="live-website-picker-empty">Website tidak ditemukan.</p> : null}
          </div>
        </ResponsiveOverlay>
      ) : null}
    </section>
  );
}
