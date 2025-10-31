"use client";

import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface UserMenuProps {
	session: Session | null;
}

export function UserMenu({ session }: UserMenuProps) {
	if (!session?.user) {
		return (
			<Button asChild size="sm">
				<Link href="/signin">Sign In</Link>
			</Button>
		);
	}

	const getInitials = (name: string | null | undefined) => {
		if (!name) return "U";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative size-9 hover:bg-accent"
				>
					<Avatar className="size-8 ring-2 ring-background">
						<AvatarImage
							src={session.user.image ?? undefined}
							alt={session.user.name ?? undefined}
						/>
						<AvatarFallback className="bg-linear-to-br from-primary to-primary/80 font-semibold text-primary-foreground text-xs">
							{getInitials(session.user.name)}
						</AvatarFallback>
					</Avatar>
					<span className="sr-only">User menu</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-0">
				<div className="flex items-center gap-3 p-4">
					<Avatar className="size-10">
						<AvatarImage
							src={session.user.image ?? undefined}
							alt={session.user.name ?? undefined}
						/>
						<AvatarFallback className="bg-linear-to-br from-primary to-primary/80 font-semibold text-primary-foreground text-sm">
							{getInitials(session.user.name)}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
						<p className="truncate font-semibold text-sm">
							{session.user.name}
						</p>
						{session.user.email && (
							<p className="truncate text-muted-foreground text-xs">
								{session.user.email}
							</p>
						)}
					</div>
				</div>

				<Separator />

				<div className="p-2">
					<Link
						href="/profile"
						className="flex items-center gap-3 px-3 py-2 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						<User className="size-4" />
						Profile
					</Link>
					<Link
						href="/settings"
						className="flex items-center gap-3 px-3 py-2 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						<Settings className="size-4" />
						Settings
					</Link>
				</div>

				<Separator />

				<div className="p-2">
					<button
						onClick={() => signOut()}
						className="flex w-full items-center gap-3 px-3 py-2 font-medium text-destructive text-sm transition-colors hover:bg-destructive/10"
						type="button"
					>
						<LogOut className="size-4" />
						Sign Out
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
