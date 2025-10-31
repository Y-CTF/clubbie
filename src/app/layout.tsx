import "@/styles/globals.css";

import type { Metadata } from "next";

import { NavbarWrapper } from "@/components/navbar";
import { TRPCReactProvider } from "@/trpc/react";

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
					<NavbarWrapper />
					{children}
				</TRPCReactProvider>
			</body>
		</html>
	);
}
