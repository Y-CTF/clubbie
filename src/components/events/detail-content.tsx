"use client";

import type { Event, Season, User } from "@prisma/client";
import { useState } from "react";
import { toast } from "sonner";
import { Emoticon } from "@/components/emoticon";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "@/trpc/react";

type EventWithRelations = Event & {
	createdBy: User;
	season: Season | null;
	rsvps: Array<{
		id: string;
		status: string;
		userId: string;
		eventId: string;
		createdAt: Date;
		updatedAt: Date;
	}>;
};

interface EventDetailContentProps {
	event: EventWithRelations;
	userId: string;
}

export function EventDetailContent({ event, userId }: EventDetailContentProps) {
	const userRsvp = event.rsvps.find((rsvp) => rsvp.userId === userId);
	const [selectedStatus, setSelectedStatus] = useState<string | null>(
		userRsvp?.status ?? null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [rsvpList, setRsvpList] = useState(event.rsvps);

	const stats = {
		going: rsvpList.filter((r) => r.status === "GOING").length,
		maybe: rsvpList.filter((r) => r.status === "MAYBE").length,
		notGoing: rsvpList.filter((r) => r.status === "NOT_GOING").length,
	};

	const utils = api.useUtils();
	const updateRsvpMutation = api.rsvps.updateMe.useMutation({
		onSuccess: () => {
			utils.events.get.invalidate({ id: event.id });
		},
	});

	const handleRsvp = async (status: "GOING" | "MAYBE" | "NOT_GOING") => {
		setIsLoading(true);
		try {
			await updateRsvpMutation.mutateAsync({
				eventId: event.id,
				status,
			});
			setSelectedStatus(status);

			setRsvpList((prevRsvps) => {
				const existingIndex = prevRsvps.findIndex((r) => r.userId === userId);
				if (existingIndex >= 0) {
					const updated = [...prevRsvps];
					updated[existingIndex]! = {
						...updated[existingIndex]!,
						status,
					};
					return updated;
				} else {
					return [
						...prevRsvps,
						{
							id: `temp-${Date.now()}`,
							eventId: event.id,
							userId,
							status,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					];
				}
			});
		} catch (error) {
			console.error("Failed to update RSVP:", error);
			toast.error("Failed to update your response");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Your Response</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-2">
						<button
							type="button"
							onClick={() => handleRsvp("GOING")}
							disabled={isLoading}
							className={`flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
								selectedStatus === "GOING"
									? "bg-success text-success-foreground"
									: "bg-muted text-muted-foreground hover:bg-success/80 hover:text-success-foreground"
							}`}
						>
							<div className="flex items-center gap-2">
								<Emoticon type="check" className="text-inherit!" />
								<span className="font-medium">Going</span>
							</div>
							{selectedStatus === "GOING" && (
								<span className="font-semibold text-sm">Selected</span>
							)}
						</button>

						<button
							type="button"
							onClick={() => handleRsvp("MAYBE")}
							disabled={isLoading}
							className={`flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
								selectedStatus === "MAYBE"
									? "bg-warning text-warning-foreground"
									: "bg-muted text-muted-foreground hover:bg-warning/80 hover:text-warning-foreground"
							}`}
						>
							<div className="flex items-center gap-2">
								<Emoticon type="question" className="text-inherit!" />
								<span className="font-medium">Maybe</span>
							</div>
							{selectedStatus === "MAYBE" && (
								<span className="font-semibold text-sm">Selected</span>
							)}
						</button>

						<button
							type="button"
							onClick={() => handleRsvp("NOT_GOING")}
							disabled={isLoading}
							className={`flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
								selectedStatus === "NOT_GOING"
									? "bg-destructive text-destructive-foreground"
									: "bg-muted text-muted-foreground hover:bg-destructive/80 hover:text-destructive-foreground"
							}`}
						>
							<div className="flex items-center gap-2">
								<Emoticon type="cross" className="text-inherit!" />
								<span className="font-medium">Not Going</span>
							</div>
							{selectedStatus === "NOT_GOING" && (
								<span className="font-semibold text-sm">Selected</span>
							)}
						</button>
					</div>
				</CardContent>
			</Card>

			{/* Attendance Stats Card */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Attendance</CardTitle>
					<CardDescription>
						{event.rsvps.length} response{event.rsvps.length !== 1 ? "s" : ""}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Emoticon type="check" className="pr-2" />
								<span className="font-medium">Going</span>
							</div>
							<Badge className="text-base">{stats.going}</Badge>
						</div>

						<Separator />

						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Emoticon type="question" className="pr-2 text-warning" />
								<span className="font-medium">Maybe</span>
							</div>
							<Badge variant="secondary" className="text-base">
								{stats.maybe}
							</Badge>
						</div>

						<Separator />

						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Emoticon type="cross" className="pr-2" />
								<span className="font-medium">Not Going</span>
							</div>
							<Badge variant="destructive" className="text-base">
								{stats.notGoing}
							</Badge>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
