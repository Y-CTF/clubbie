import type { Event, RSVP, Season, User } from "@prisma/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { AttendanceFooter } from "./attendance-footer";
import { DeadlineBadge } from "./deadline-badge";

type EventWithRelations = Event & {
	createdBy: User;
	season: Season | null;
	rsvps: RSVP[];
};

interface EventCardProps {
	event: EventWithRelations;
	userId: string;
}

const EVENT_KIND_LABELS: Record<string, string> = {
	COMPETITION: "Competition",
	SOCIAL: "Social",
	MEETING: "Meeting",
	WORKSHOP: "Workshop",
	CONFERENCE: "Conference",
	OTHER: "Other",
};

export function EventCard({ event, userId }: EventCardProps) {
	const kindLabel =
		EVENT_KIND_LABELS[event.kind as keyof typeof EVENT_KIND_LABELS] ??
		EVENT_KIND_LABELS.OTHER;

	const goingCount = event.rsvps.filter((r) => r.status === "GOING").length;
	const maybeCount = event.rsvps.filter((r) => r.status === "MAYBE").length;
	const userRsvp = event.rsvps.find((r) => r.userId === userId);

	const formatDate = (date: Date) =>
		new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);

	return (
		<Card className="group flex flex-col overflow-hidden py-0 transition-all hover:border-primary/80">
			<Link href={`/events/${event.id}`} className="flex flex-1 flex-col">
				<div className="flex flex-col gap-3 px-4 py-4">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 flex-1">
							<CardTitle className="truncate text-base transition-colors group-hover:text-primary">
								{event.name}
							</CardTitle>
							<CardDescription className="truncate text-xs">
								by {event.createdBy.name}
							</CardDescription>
						</div>
						<Badge
							variant="outline"
							className="shrink-0 whitespace-nowrap text-xs"
						>
							{kindLabel}
						</Badge>
					</div>

					<div className="relative flex items-center">
						<div className="font-medium text-muted-foreground text-xs">
							{formatDate(event.start)}
						</div>
						<DeadlineBadge deadline={event.deadline} />
					</div>

					<div className="h-10">
						{event.description && (
							<p className="line-clamp-2 text-muted-foreground text-sm">
								{event.description}
							</p>
						)}
					</div>
				</div>
			</Link>

			<AttendanceFooter
				eventId={event.id}
				goingCount={goingCount}
				maybeCount={maybeCount}
				currentStatus={userRsvp?.status ?? null}
			/>
		</Card>
	);
}
