import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Typography } from "@/components/ui/typography";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
	title: "Events - clubbie",
	description: "Browse and manage club events",
};

export default async function EventsPage() {
	const _session = await auth();

	return (
		<Container>
			<Typography.H1>Events</Typography.H1>
		</Container>
	);
}
