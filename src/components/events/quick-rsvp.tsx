"use client";

import { useState } from "react";
import type { RSVPStatus } from "@prisma/client";
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
		<div className="flex items-center gap-1">
			<button
				onClick={(e) => handleRsvp(e, "GOING")}
				disabled={isLoading}
				className={`flex items-center gap-1 px-2 py-1 transition-all cursor-pointer ${
					optimisticStatus === "GOING"
						? "text-success bg-success/10"
						: "text-muted-foreground hover:text-success hover:bg-success/5"
				} disabled:cursor-not-allowed`}
				title="Going"
			>
				<Emoticon type="check" />
			</button>
			<button
				onClick={(e) => handleRsvp(e, "MAYBE")}
				disabled={isLoading}
				className={`flex items-center gap-1 px-2 py-1 transition-all cursor-pointer ${
					optimisticStatus === "MAYBE"
						? "text-warning bg-warning/10"
						: "text-muted-foreground hover:text-warning hover:bg-warning/5"
				} disabled:cursor-not-allowed`}
				title="Maybe"
			>
				<Emoticon type="question" className="scale-75" />
			</button>
			<button
				onClick={(e) => handleRsvp(e, "NOT_GOING")}
				disabled={isLoading}
				className={`flex items-center gap-1 px-2 py-1 transition-all cursor-pointer ${
					optimisticStatus === "NOT_GOING"
						? "text-destructive bg-destructive/10"
						: "text-muted-foreground hover:text-destructive hover:bg-destructive/5"
				} disabled:cursor-not-allowed`}
				title="Not Going"
			>
				<Emoticon type="cross" />
			</button>
		</div>
	);
}
