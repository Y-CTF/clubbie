"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Emoticon } from "@/components/emoticon";

interface UserMenuItemsProps {
	onItemClick?: () => void;
	variant?: "popover" | "inline";
}

export function UserMenuItems({
	onItemClick,
	variant = "popover",
}: UserMenuItemsProps) {
	const linkClassName =
		variant === "popover"
			? "flex items-center gap-3 px-3 py-2 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
			: "flex items-center gap-3 px-3 py-2.5 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground";

	const buttonClassName =
		variant === "popover"
			? "flex w-full items-center gap-3 px-3 py-2 font-medium text-destructive text-sm transition-colors hover:bg-destructive/10"
			: "flex w-full items-center gap-3 px-3 py-2.5 font-medium text-destructive text-sm transition-colors hover:bg-destructive/10";

	return (
		<>
			<Link href="/profile" onClick={onItemClick} className={linkClassName}>
				<Emoticon type="smile" className="size-4" />
				Profile
			</Link>
			<Link href="/settings" onClick={onItemClick} className={linkClassName}>
				<Emoticon type="settings" className="size-4" />
				Settings
			</Link>
			<button
				onClick={() => {
					onItemClick?.();
					signOut();
				}}
				className={buttonClassName}
				type="button"
			>
				{/* <LogOut className="size-4" /> */}
				<Emoticon type="chevron" className="size-4" />
				Sign Out
			</button>
		</>
	);
}
