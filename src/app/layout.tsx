import "@/styles/globals.css";

import type { Metadata } from "next";
import Footer from "@/components/footer";
import { NavbarWrapper } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";
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
					<div className="min-h-[calc(100svh-14rem)]">{children}</div>
					<Footer />
					<Toaster position="top-center" />
				</TRPCReactProvider>
			</body>
		</html>
	);
}
