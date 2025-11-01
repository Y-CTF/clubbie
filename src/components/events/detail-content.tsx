"use client";

import type { Event, Season, User } from "@prisma/client";
import { useState } from "react";
import { Emoticon } from "@/components/emoticon";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CollapsibleList } from "@/components/ui/collapsible-list";
import { Separator } from "@/components/ui/separator";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import { cn } from "@/lib/utils";
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
		user?: {
			id: string;
			name: string | null;
			email?: string | null;
		};
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
	const [rsvpList, setRsvpList] = useState(event.rsvps);

	const stats = {
		going: rsvpList.filter((r) => r.status === "GOING").length,
		maybe: rsvpList.filter((r) => r.status === "MAYBE").length,
		notGoing: rsvpList.filter((r) => r.status === "NOT_GOING").length,
	};

	const attendees = {
		going: rsvpList
			.filter((r) => r.status === "GOING" && r.user?.name)
			.map((r) => r.user!.name!)
			.sort(),
		maybe: rsvpList
			.filter((r) => r.status === "MAYBE" && r.user?.name)
			.map((r) => r.user!.name!)
			.sort(),
	};

	const utils = api.useUtils();
	const updateRsvpMutation = api.rsvps.updateMe.useMutation({
		onSuccess: () => {
			utils.events.get.invalidate({ id: event.id });
		},
	});

	const deleteRsvpMutation = api.rsvps.deleteMe.useMutation({
		onSuccess: () => {
			utils.events.get.invalidate({ id: event.id });
		},
	});

	const { mutate: toggleRsvp } = useOptimisticMutation({
		mutationFn: async (status: "GOING" | "MAYBE" | "NOT_GOING" | null) => {
			if (status === null) {
				await deleteRsvpMutation.mutateAsync({ eventId: event.id });
			} else {
				await updateRsvpMutation.mutateAsync({
					eventId: event.id,
					status,
				});
			}
		},
		onOptimisticUpdate: (status: "GOING" | "MAYBE" | "NOT_GOING" | null) => {
			if (status === null) {
				// Toggle off
				setSelectedStatus(null);
				setRsvpList((prevRsvps) =>
					prevRsvps.filter((r) => r.userId !== userId),
				);
			} else {
				// Set new status
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
					}
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
				});
			}
		},
		onError: (status: "GOING" | "MAYBE" | "NOT_GOING" | null) => {
			const previousStatus = selectedStatus;
			if (status === null) {
				// Revert toggle off
				setSelectedStatus(previousStatus);
				if (previousStatus) {
					setRsvpList((prevRsvps) => [
						...prevRsvps,
						{
							id: `temp-${Date.now()}`,
							eventId: event.id,
							userId,
							status: previousStatus,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					]);
				}
			} else {
				// Revert status change
				setSelectedStatus(previousStatus);
				setRsvpList((prevRsvps) => {
					const existingIndex = prevRsvps.findIndex((r) => r.userId === userId);
					if (existingIndex >= 0) {
						const updated = [...prevRsvps];
						if (previousStatus) {
							updated[existingIndex]! = {
								...updated[existingIndex]!,
								status: previousStatus,
							};
						} else {
							updated.splice(existingIndex, 1);
						}
						return updated;
					}
					return prevRsvps;
				});
			}
		},
		errorMessage: "Failed to update your response",
	});

	const handleRsvp = (status: "GOING" | "MAYBE" | "NOT_GOING") => {
		if (selectedStatus === status) {
			// Toggle off
			toggleRsvp(null);
		} else {
			// Set new status
			toggleRsvp(status);
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
							className={cn(
								"flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
								selectedStatus === "GOING"
									? "bg-success text-success-foreground"
									: "bg-muted text-muted-foreground hover:bg-success/80 hover:text-success-foreground",
							)}
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
							className={cn(
								"flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
								selectedStatus === "MAYBE"
									? "bg-warning text-warning-foreground"
									: "bg-muted text-muted-foreground hover:bg-warning/80 hover:text-warning-foreground",
							)}
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
							className={cn(
								"flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
								selectedStatus === "NOT_GOING"
									? "bg-destructive text-destructive-foreground"
									: "bg-muted text-muted-foreground hover:bg-destructive/80 hover:text-destructive-foreground",
							)}
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
					<div className="space-y-4">
						<div>
							<div className="mb-3 flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Emoticon type="check" className="pr-2" />
									<span className="font-medium">Going</span>
								</div>
								<Badge className="text-base">{stats.going}</Badge>
							</div>
							<div className="ml-6">
								<CollapsibleList
									items={attendees.going}
									threshold={5}
									itemClassName="text-sm text-muted-foreground"
									emptyMessage="No one going yet"
								/>
							</div>
						</div>

						<Separator />

						<div>
							<div className="mb-3 flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Emoticon type="question" className="pr-2 text-warning" />
									<span className="font-medium">Maybe</span>
								</div>
								<Badge variant="secondary" className="text-base">
									{stats.maybe}
								</Badge>
							</div>
							<div className="ml-6">
								<CollapsibleList
									items={attendees.maybe}
									threshold={5}
									itemClassName="text-sm text-muted-foreground"
									emptyMessage="No one unsure yet"
								/>
							</div>
						</div>

						<Separator />

						<div>
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
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
