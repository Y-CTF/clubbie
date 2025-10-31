import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Typography } from "@/components/ui/typography";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
	title: "Admin - clubbie",
	description: "Admin dashboard for managing the application",
};

export default async function AdminPage() {
	const _session = await auth();

	return (
		<Container>
			<Typography.H1>Profile</Typography.H1>
		</Container>
	);
}
