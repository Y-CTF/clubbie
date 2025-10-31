import "@/styles/globals.css";

import type { Metadata } from "next";

import { NavbarWrapper } from "@/components/navbar";
import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
	title: "clubbie",
	description: "Club management made easy!",
	icons: {
		icon: [
			{ url: "/logo.png", type: "image/png" },
			{ url: "/favicon.ico", sizes: "any" },
		],
	},
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
