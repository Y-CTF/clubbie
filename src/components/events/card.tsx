import type { Event, RSVP, Season, User } from "@prisma/client";
import Link from "next/link";
import { Emoticon } from "@/components/emoticon";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

type EventWithRelations = Event & {
	createdBy: User;
	season: Season | null;
	rsvps: RSVP[];
};

interface EventCardProps {
	event: EventWithRelations;
}

const EVENT_KIND_CONFIG: Record<string, { label: string; emoji: string }> = {
	COMPETITION: {
		label: "Competition",
		emoji: "🏆",
	},
	SOCIAL: {
		label: "Social",
		emoji: "🎉",
	},
	MEETING: {
		label: "Meeting",
		emoji: "💬",
	},
	WORKSHOP: {
		label: "Workshop",
		emoji: "🛠️",
	},
	CONFERENCE: {
		label: "Conference",
		emoji: "🎤",
	},
	OTHER: {
		label: "Other",
		emoji: "📌",
	},
};

type DeadlineStatus = "passed" | "urgent" | "approaching" | null;

function getDeadlineStatus(deadline: Date | null): DeadlineStatus {
	if (!deadline) return null;

	const now = new Date();
	const hoursUntilDeadline =
		(deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

	if (hoursUntilDeadline < 0) return "passed";
	if (hoursUntilDeadline < 24) return "urgent";
	if (hoursUntilDeadline < 72) return "approaching";

	return null;
}

export function EventCard({ event }: EventCardProps) {
	const attendeeCount = event.rsvps.length;
	const kindConfig =
		EVENT_KIND_CONFIG[event.kind as keyof typeof EVENT_KIND_CONFIG] ??
		EVENT_KIND_CONFIG.OTHER;

	const goingCount = event.rsvps.filter((r) => r.status === "GOING").length;
	const maybeCount = event.rsvps.filter((r) => r.status === "MAYBE").length;

	const deadlineStatus = getDeadlineStatus(event.deadline ?? null);

	const formatDate = (date: Date) => {
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	};

	return (
		<Link href={`/events/${event.id}`}>
			<Card className="group flex flex-col overflow-hidden py-0 transition-all hover:border-primary/80">
				{/* Content */}
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
						<span className="shrink-0 whitespace-nowrap">
							<Badge variant="outline" className="text-xs">
								{kindConfig?.label}
							</Badge>
						</span>
					</div>

					{/* Date and Deadline indicator */}
					<div className="relative flex items-center">
						<div className="font-medium text-muted-foreground text-xs">
							{formatDate(event.start)}
						</div>
						{deadlineStatus && (
							<div
								className={`absolute right-0 px-1.5 py-0.5 font-semibold text-xs ${
									deadlineStatus === "passed"
										? "bg-destructive/20 text-destructive"
										: deadlineStatus === "urgent"
											? "bg-destructive/25 text-destructive"
											: "bg-warning/20 text-warning"
								}`}
							>
								{deadlineStatus === "passed"
									? "Passed"
									: deadlineStatus === "urgent"
										? "Today"
										: "Soon"}
							</div>
						)}
					</div>

					<div className="h-10">
						{event.description && (
							<p className="line-clamp-2 text-muted-foreground text-sm">
								{event.description}
							</p>
						)}
					</div>

					{/* Attendance overview */}
					<div className="flex items-center gap-3 border-border border-t pt-3">
						{goingCount > 0 && (
							<div className="flex items-center gap-1.5">
								<Emoticon type="check" />
								<span className="font-medium text-success text-xs">
									{goingCount}
								</span>
							</div>
						)}
						{maybeCount > 0 && (
							<div className="flex items-center gap-1.5">
								<Emoticon type="question" className="scale-75 text-warning!" />
								<span className="font-medium text-warning text-xs">
									{maybeCount}
								</span>
							</div>
						)}
						<span className="ml-auto text-muted-foreground text-xs">
							{attendeeCount} total
						</span>
					</div>
				</div>
			</Card>
		</Link>
	);
}
