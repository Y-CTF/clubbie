import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventDetailContent } from "@/components/events";
import { DateDisplay } from "@/components/events/date-display";
import { DeadlineWarning } from "@/components/events/deadline-warning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { auth } from "@/server/auth";
import { api } from "@/trpc/server";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;

	try {
		const event = await api.events.get({ id });
		return {
			title: `${event?.name} - clubbie`,
			description: event?.description || "Event details",
		};
	} catch {
		return {
			title: "Event not found - clubbie",
			description: "The event you're looking for doesn't exist",
		};
	}
}

export default async function EventDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) {
		redirect("/signin");
	}

	const { id } = await params;

	try {
		const event = await api.events.get({ id });

		if (!event) {
			notFound();
		}

		return (
			<Container>
				<div className="mb-6">
					<Link href="/events">
						<Button variant="ghost" size="sm" className="gap-2">
							<ArrowLeft className="h-4 w-4" />
							Back to Events
						</Button>
					</Link>
				</div>

				<div className="grid gap-8 lg:grid-cols-3">
					<div className="lg:col-span-2">
						<Card>
							<CardHeader>
								<div className="flex items-start justify-between gap-4">
									<div className="flex-1">
										<CardTitle className="text-3xl">{event.name}</CardTitle>
										<CardDescription className="mt-2 text-base">
											Created by {event.createdBy.name}
										</CardDescription>
									</div>
									{event.season && (
										<Badge variant="secondary" className="text-base">
											{event.season.name}
										</Badge>
									)}
								</div>
							</CardHeader>
							<CardContent className="space-y-6">
								{event.deadline && (
									<DeadlineWarning deadline={event.deadline} />
								)}
								{/* Event Details Grid */}
								<div className="grid gap-4 sm:grid-cols-2">
									<DateDisplay date={event.start} label="Start" />
									{event.end && <DateDisplay date={event.end} label="End" />}
									{event.location && (
										<div>
											<p className="text-muted-foreground text-sm">Location</p>
											<p className="font-medium">{event.location}</p>
										</div>
									)}
									{event.deadline && (
										<DateDisplay date={event.deadline} label="Deadline" />
									)}
								</div>

								{event.description && (
									<div>
										<h3 className="mb-2 font-semibold">Description</h3>
										<p className="whitespace-pre-wrap text-muted-foreground">
											{event.description}
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					<div>
						<EventDetailContent event={event} userId={session.user.id} />
					</div>
				</div>
			</Container>
		);
	} catch (error) {
		console.error("Error fetching event:", error);
		notFound();
	}
}
