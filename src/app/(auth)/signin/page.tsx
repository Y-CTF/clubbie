import { LogIn } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Emoticon } from "@/components/emoticon";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { auth, signIn } from "@/server/auth";

export const metadata: Metadata = {
	title: "Sign In - clubbie",
	description: "Sign in to your clubbie account",
};

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
	const session = await auth();
	const params = await searchParams;

	if (session) {
		redirect(params.callbackUrl ?? "/");
	}

	return (
		<div className="flex h-[calc(100vh-4rem)] items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-4 text-center">
					<Logo variant="banner" size="lg" className="mx-auto shadow-lg" />
					<div className="space-y-2">
						<CardTitle className="font-bold text-3xl tracking-tight">
							Welcome Back! <Emoticon type="celebrate" />
						</CardTitle>
						<CardDescription className="text-base">
							Sign in with your educational account to continue
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					{params.error && (
						<div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive text-sm">
							Authentication failed. Please try again.
						</div>
					)}

					<form
						action={async () => {
							"use server";
							await signIn("eduid", {
								redirectTo: params.callbackUrl ?? "/",
							});
						}}
					>
						<Button type="submit" className="w-full gap-2 shadow-md" size="lg">
							<LogIn className="size-5" />
							Continue with EduID
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
