import "@/styles/globals.css";

import type { Metadata } from "next";

import { TRPCReactProvider } from "@/trpc/react";
import { LogoutButton } from "./_components/logout";

export const metadata: Metadata = {
	title: "clubbie",
	description: "Club management made easy!",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>
				<TRPCReactProvider>
					{/* TODO: remove this, currently for testing purposes */}
					<LogoutButton />
					{children}
				</TRPCReactProvider>
			</body>
		</html>
	);
}
