"use client";

import type { RSVPStatus } from "@prisma/client";
import { useState } from "react";
import { Emoticon } from "@/components/emoticon";
import { api } from "@/trpc/react";

interface QuickRsvpProps {
	eventId: string;
	currentStatus: RSVPStatus | null;
}

export function QuickRsvp({ eventId, currentStatus }: QuickRsvpProps) {
	const [optimisticStatus, setOptimisticStatus] = useState<RSVPStatus | null>(
		currentStatus,
	);
	const [isLoading, setIsLoading] = useState(false);
	const utils = api.useUtils();

	const updateRsvpMutation = api.rsvps.updateMe.useMutation({
		onSuccess: () => {
			utils.events.list.invalidate();
			utils.events.get.invalidate({ id: eventId });
		},
		onError: () => {
			setOptimisticStatus(currentStatus);
		},
	});

	const handleRsvp = async (
		e: React.MouseEvent,
		status: "GOING" | "MAYBE" | "NOT_GOING",
	) => {
		e.preventDefault();
		e.stopPropagation();

		setOptimisticStatus(status);
		setIsLoading(true);
		try {
			await updateRsvpMutation.mutateAsync({
				eventId,
				status,
			});
		} catch (error) {
			console.error("Failed to update RSVP:", error);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex items-center gap-1.5 md:gap-1">
			<button
				onClick={(e) => handleRsvp(e, "GOING")}
				disabled={isLoading}
				className={`flex cursor-pointer items-center gap-1 px-3 py-2 transition-all md:px-2 md:py-1 ${
					optimisticStatus === "GOING"
						? "bg-success/10 text-success"
						: "text-muted-foreground hover:bg-success/5 hover:text-success"
				} disabled:cursor-not-allowed`}
				title="Going"
				type="button"
			>
				<Emoticon type="check" />
			</button>
			<button
				onClick={(e) => handleRsvp(e, "MAYBE")}
				disabled={isLoading}
				className={`flex cursor-pointer items-center gap-1 px-3 py-2 transition-all md:px-2 md:py-1 ${
					optimisticStatus === "MAYBE"
						? "bg-warning/10 text-warning"
						: "text-muted-foreground hover:bg-warning/5 hover:text-warning"
				} disabled:cursor-not-allowed`}
				title="Maybe"
				type="button"
			>
				<Emoticon type="question" className="scale-75" />
			</button>
			<button
				onClick={(e) => handleRsvp(e, "NOT_GOING")}
				disabled={isLoading}
				className={`flex cursor-pointer items-center gap-1 px-3 py-2 transition-all md:px-2 md:py-1 ${
					optimisticStatus === "NOT_GOING"
						? "bg-destructive/10 text-destructive"
						: "text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
				} disabled:cursor-not-allowed`}
				title="Not Going"
				type="button"
			>
				<Emoticon type="cross" />
			</button>
		</div>
	);
}
