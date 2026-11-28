import type { ReactNode } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock3, Globe2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimelineNavigation } from "@/lib/timeline/navigation";
import styles from "./timeline.module.css";
export function TimelineToolbar({
  navigation, date, timeZone, hour12, onNavigate, onDate, onPan, onNow, children, disabled = false,
}: {
  navigation: TimelineNavigation;
  date: string;
  timeZone: string;
  hour12: boolean;
  onNavigate: (next: Partial<TimelineNavigation>) => void;
  onDate: (value: string) => void;
  onPan: (hours: number) => void;
  onNow: () => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const zoneLabel = timeZone.replaceAll("_", " ");
  const regionEnd = zoneLabel.lastIndexOf("/") + 1;
  return (
    <div className={styles.toolbar}>
      <h2 id="schedule-heading" tabIndex={-1}>Schedule</h2>
      <div className={styles.navigation}>
        {disabled ? (
          <span className={styles.pendingDate} aria-hidden="true" />
        ) : (
          <span className={styles.dateControl}>
            <input aria-label="Schedule date" type="date" min="0002-01-01" max="9998-12-31"
              value={date} onChange={(event) => onDate(event.target.value)} />
            <Calendar aria-hidden="true" size={16} />
          </span>
        )}
        <div>
          <Button disabled={disabled} size="sm" aria-label="Earlier" onClick={() => onPan(-3)}><ChevronLeft size={14} /><span>Earlier</span></Button>
          <Button disabled={disabled} size="sm" onClick={onNow}>Now</Button>
          <Button disabled={disabled} size="sm" aria-label="Later" onClick={() => onPan(3)}><span>Later</span><ChevronRight size={14} /></Button>
        </div>
      </div>
      <Button id="schedule-favorites" className={styles.favoritesToggle} disabled={disabled} size="sm" aria-pressed={navigation.favoritesOnly} onClick={() => onNavigate({ favoritesOnly: !navigation.favoritesOnly })}>
        <Star aria-hidden="true" size={14} />Favorites only
      </Button>
      {children}
      <div className={styles.metadata} aria-hidden={!timeZone}>
        <span>
          <Globe2 aria-hidden="true" size={13} />
          <span className="sr-only">Timezone</span>
          <span>{zoneLabel.slice(0, regionEnd)}<wbr />{zoneLabel.slice(regionEnd)}</span>
        </span>
        <span><Clock3 aria-hidden="true" size={13} /><span className="sr-only">Hour format</span>{hour12 ? "12h" : "24h"}</span>
      </div>
    </div>
  );
}
