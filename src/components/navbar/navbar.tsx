"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import type { NavItem } from "./config";
import { MobileNav } from "./mobile";
import { UserMenu } from "./user";

interface NavbarProps {
	items: NavItem[];
	session: Session | null;
	className?: string;
}

export function Navbar({ items, session, className }: NavbarProps) {
	const pathname = usePathname();

	const filteredItems = items.filter(
		(item) => !item.requiresAuth || session?.user,
	);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/80",
				className,
			)}
		>
			<div className="flex h-16 items-center justify-between px-8">
				<div className="flex items-center gap-8">
					<Link href="/" className="transition-opacity hover:opacity-80">
						<Logo variant="inline" />
					</Link>

					<nav className="hidden items-center gap-1 md:flex">
						{filteredItems.map((item) => {
							const isActive = pathname === item.href;
							return (
								<Link
									key={item.href}
									href={item.href}
									className={cn(
										"relative flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors hover:text-foreground",
										isActive ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{item.icon && <item.icon className="size-4" />}
									{item.label}
									{isActive && (
										<span className="absolute inset-x-1 bottom-0 h-0.5 bg-primary" />
									)}
								</Link>
							);
						})}
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<div className="hidden md:block">
						<UserMenu session={session} />
					</div>
					<MobileNav items={items} session={session} />
				</div>
			</div>
		</header>
	);
}
