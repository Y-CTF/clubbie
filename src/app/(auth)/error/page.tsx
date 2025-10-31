import type { Metadata } from "next";
import Link from "next/link";
import { Emoticon } from "@/components/emoticon";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
	title: "Authentication Error - clubbie",
	description: "An error occurred during authentication",
};

const errorMessages: Record<string, string> = {
	Configuration: "There is a problem with the server configuration.",
	AccessDenied: "You do not have permission to sign in.",
	Verification: "The verification token has expired or has already been used.",
	Default: "An error occurred during authentication.",
};

export default async function AuthErrorPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const params = await searchParams;
	const error = params.error ?? "Default";
	const errorMessage = errorMessages[error] ?? errorMessages.Default;

	return (
		<div className="flex h-[calc(100vh-4rem)] items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-4 text-center">
					<div className="mx-auto flex size-16 items-center justify-center bg-destructive/10 text-destructive">
						<Emoticon
							className="-translate-y-1 size-8 font-normal text-4xl"
							type="cross"
						/>
					</div>
					<div className="space-y-2">
						<CardTitle className="font-bold text-3xl tracking-tight">
							Authentication Error
						</CardTitle>
						<CardDescription className="text-base">
							{errorMessage}
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<Button asChild className="w-full" size="lg">
						<Link href="/signin">Back to Sign In</Link>
					</Button>

					<p className="text-center text-muted-foreground text-xs">
						If this problem persists, please contact support.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
