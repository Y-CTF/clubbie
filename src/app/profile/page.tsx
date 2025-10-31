import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Typography } from "@/components/ui/typography";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
	title: "Profile - clubbie",
	description: "View and manage your profile",
};

export default async function ProfilePage() {
	const _session = await auth();

	return (
		<Container>
			<Typography.H1>Profile</Typography.H1>
		</Container>
	);
}
