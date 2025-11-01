import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EventsList } from "@/components/events";
import { Container } from "@/components/ui/container";
import { Typography } from "@/components/ui/typography";
import { getServerPermissions, Permission } from "@/lib/permissions";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
	title: "Events - clubbie",
	description: "Browse and manage club events",
};

export default async function EventsPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const session = await auth();
	if (!session?.user) {
		redirect("/signin");
	}
	const canCreateEvents = await getServerPermissions(Permission.CreateEvents);

	return (
		<Container>
			<Typography.H1>Events</Typography.H1>
			<EventsList
				searchParams={searchParams}
				canCreateEvents={canCreateEvents}
			/>
		</Container>
	);
}
