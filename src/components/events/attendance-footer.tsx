import type { RSVPStatus } from "@prisma/client";
import { Emoticon } from "@/components/emoticon";
import { QuickRsvp } from "./quick-rsvp";

interface AttendanceFooterProps {
	eventId: string;
	goingCount: number;
	maybeCount: number;
	currentStatus: RSVPStatus | null;
}

export function AttendanceFooter({
	eventId,
	goingCount,
	maybeCount,
	currentStatus,
}: AttendanceFooterProps) {
	return (
		<div className="flex items-center justify-between gap-3 border-border border-t px-4 py-3">
			<div className="flex items-center gap-3">
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
			</div>
			<QuickRsvp eventId={eventId} currentStatus={currentStatus} />
		</div>
	);
}
