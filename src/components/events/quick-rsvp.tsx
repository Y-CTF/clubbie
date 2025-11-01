"use client";

import type { RSVPStatus } from "@prisma/client";
import { useState } from "react";
import { Emoticon } from "@/components/emoticon";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

interface QuickRsvpProps {
	eventId: string;
	currentStatus: RSVPStatus | null;
}

export function QuickRsvp({ eventId, currentStatus }: QuickRsvpProps) {
	const [optimisticStatus, setOptimisticStatus] = useState<RSVPStatus | null>(
		currentStatus,
	);
	const utils = api.useUtils();

	const updateRsvpMutation = api.rsvps.updateMe.useMutation({
		onSuccess: () => {
			utils.events.list.invalidate();
			utils.events.get.invalidate({ id: eventId });
		},
	});

	const { mutate: updateRsvp } = useOptimisticMutation({
		mutationFn: async (status: "GOING" | "MAYBE" | "NOT_GOING") => {
			await updateRsvpMutation.mutateAsync({
				eventId,
				status,
			});
		},
		onOptimisticUpdate: (status: "GOING" | "MAYBE" | "NOT_GOING") => {
			setOptimisticStatus(status);
		},
		onError: () => {
			setOptimisticStatus(currentStatus);
		},
		errorMessage: "Failed to update your response",
	});

	const handleRsvp = (
		e: React.MouseEvent,
		status: "GOING" | "MAYBE" | "NOT_GOING",
	) => {
		e.preventDefault();
		e.stopPropagation();

		updateRsvp(status);
	};

	return (
		<div className="flex items-center gap-1.5 md:gap-1">
			<button
				onClick={(e) => handleRsvp(e, "GOING")}
				className={cn(
					"flex cursor-pointer items-center gap-1 px-3 py-2 transition-all md:px-2 md:py-1",
					optimisticStatus === "GOING"
						? "bg-success/10 text-success"
						: "text-muted-foreground hover:bg-success/5 hover:text-success",
				)}
				title="Going"
				type="button"
			>
				<Emoticon type="check" />
			</button>
			<button
				onClick={(e) => handleRsvp(e, "MAYBE")}
				className={cn(
					"flex cursor-pointer items-center gap-1 px-3 py-2 transition-all md:px-2 md:py-1",
					optimisticStatus === "MAYBE"
						? "bg-warning/10 text-warning"
						: "text-muted-foreground hover:bg-warning/5 hover:text-warning",
				)}
				title="Maybe"
				type="button"
			>
				<Emoticon type="question" className="scale-75" />
			</button>
			<button
				onClick={(e) => handleRsvp(e, "NOT_GOING")}
				className={cn(
					"flex cursor-pointer items-center gap-1 px-3 py-2 transition-all md:px-2 md:py-1",
					optimisticStatus === "NOT_GOING"
						? "bg-destructive/10 text-destructive"
						: "text-muted-foreground hover:bg-destructive/5 hover:text-destructive",
				)}
				title="Not Going"
				type="button"
			>
				<Emoticon type="cross" />
			</button>
		</div>
	);
}
