import Link from "next/link";
import { Suspense } from "react";
import { Paginator } from "@/components/paginator";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyTitle,
} from "@/components/ui/empty";
import { ProgressBar } from "@/components/ui/progress-bar";
import { auth } from "@/server/auth";
import { api } from "@/trpc/server";
import { EventCard } from "./card";

const ITEMS_PER_PAGE = 9;

async function EventsListContent({
	page,
	canCreateEvents,
	userId,
}: {
	page: number;
	canCreateEvents: boolean;
	userId: string;
}) {
	const data = await api.events.list({ page, limit: ITEMS_PER_PAGE });
	const { events, pagination } = data || { events: [], pagination: null };

	if (!pagination || events.length === 0) {
		return (
			<Empty>
				<EmptyContent>
					<EmptyTitle>No events found</EmptyTitle>
					<EmptyDescription>
						There are no events available at the moment. Please check back
						later.
					</EmptyDescription>
					{canCreateEvents && (
						<Link href="/events/create">
							<Button>+ Create Event</Button>
						</Link>
					)}
				</EmptyContent>
			</Empty>
		);
	}

	return (
		<div className="space-y-8">
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{events.map((event) => (
					<EventCard key={event.id} event={event} userId={userId} />
				))}
			</div>

			<Paginator pagination={pagination} baseUrl="/events" />
		</div>
	);
}

export async function EventsList({
	searchParams,
	canCreateEvents,
}: {
	searchParams: Promise<{ page?: string }>;
	canCreateEvents: boolean;
}) {
	const session = await auth();
	const userId = session?.user?.id || "";

	const params = await searchParams;
	const page = Math.max(1, parseInt(params.page || "1", 10));

	return (
		<Suspense
			fallback={
				<div className="flex justify-center py-12">
					<ProgressBar label="Loading events..." showPercentage={false} />
				</div>
			}
		>
			<EventsListContent
				page={page}
				canCreateEvents={canCreateEvents}
				userId={userId}
			/>
		</Suspense>
	);
}
