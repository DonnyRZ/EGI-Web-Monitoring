"use client";

import { LiveWebsiteViewer } from "@/components/website/LiveWebsiteViewer";
import { WebsiteTile } from "@/components/website/WebsiteTile";
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

  return (
    <section className="website-wall" aria-label="Daftar website">
      {selectedCard ? (
        <LiveWebsiteViewer
          key={selectedCard.website.id}
          website={selectedCard.website}
          publicView={publicView}
          onClose={() => onSelect(null)}
        />
      ) : null}

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
    </section>
  );
}
