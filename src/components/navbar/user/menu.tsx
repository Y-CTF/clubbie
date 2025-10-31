"use client";

import Link from "next/link";
import type { Session } from "next-auth";

import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

import { UserAvatar } from "./avatar";
import { UserMenuItems } from "./menu-items";

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

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative size-9 hover:bg-accent"
				>
					<div className="ring-2 ring-background">
						<UserAvatar user={session.user} size="sm" />
					</div>
					<span className="sr-only">User menu</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-0">
				<div className="flex items-center gap-3 p-4">
					<UserAvatar user={session.user} size="md" />
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
					<UserMenuItems variant="popover" />
				</div>
			</PopoverContent>
		</Popover>
	);
}
