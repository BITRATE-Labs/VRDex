import type { TimelineEvent } from "../../../../../../convex/_eventTimelineTypes";
import { InterestButton } from "@/components/ui/interest-button";
import { recentEventTime } from "@/lib/timeline/window-cache";
import { planSaveState } from "@/lib/timeline/plan-actions";
import { ViewerLocalEventDateTime } from "../viewer-local-event-times";
import type { TimelineActions } from "./timeline-event-bar";
import styles from "./timeline.module.css";

export function TimelineRecent({ records, now, timeZone, hour12, ...actions }: TimelineActions & {
  records: TimelineEvent[];
  now: number;
  timeZone: string;
  hour12: boolean;
}) {
  const recent = records.flatMap((event) => {
    const time = recentEventTime(event, now);
    return time === undefined ? [] : [{ event, time }];
  }).sort((a, b) => b.time.at - a.time.at);
  if (recent.length === 0) return null;
  return <section className={styles.recent} aria-label="Recent events">
    <h3>Recent</h3>
    <ul>{recent.map(({ event, time }) => <li key={event.id}>
      <button aria-label={`Open ${event.title}`} aria-pressed={actions.selection?.eventId === event.id}
        onClick={() => actions.onSelect({ eventId: event.id, slug: event.slug })}>
        <strong>{event.title}</strong>
        <span>{time.label} · <ViewerLocalEventDateTime timestamp={time.at} timeZone={timeZone} hour12={hour12} showTimeZone={false} /></span>
      </button>
      <InterestButton label={event.title} state={planSaveState(actions.plan, { kind: "event", eventId: event.id })}
        onToggle={() => actions.onSave({ kind: "event", eventId: event.id })} />
    </li>)}</ul>
  </section>;
}
