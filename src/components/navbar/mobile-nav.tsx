"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { NavItem } from "./nav-config";

interface MobileNavProps {
	items: NavItem[];
	session: Session | null;
}

export function MobileNav({ items, session }: MobileNavProps) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	const filteredItems = items.filter(
		(item) => !item.requiresAuth || session?.user,
	);

	useEffect(() => {
		if (open) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}

		return () => {
			document.body.style.overflow = "unset";
		};
	}, [open]);

	return (
		<div className="md:hidden">
			<Button
				variant="ghost"
				size="icon"
				onClick={() => setOpen(!open)}
				className="relative"
			>
				{open ? <X className="size-5" /> : <Menu className="size-5" />}
				<span className="sr-only">Toggle menu</span>
			</Button>

			{open && (
				<>
					<button
						className="fixed inset-0 top-16 z-40 bg-background/80 backdrop-blur-sm"
						onClick={() => setOpen(false)}
						type="button"
						aria-label="Close menu"
					/>
					<div className="slide-in-from-top-4 fixed top-16 right-0 left-0 z-50 animate-in duration-200">
						<div className="border-b bg-background shadow-lg">
							<nav className="container flex flex-col gap-1 p-4">
								{filteredItems.map((item) => {
									const isActive = pathname === item.href;
									return (
										<Link
											key={item.href}
											href={item.href}
											onClick={() => setOpen(false)}
											className={cn(
												"flex items-center gap-3 px-3 py-2.5 font-medium text-sm transition-colors",
												isActive
													? "bg-accent text-accent-foreground"
													: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
											)}
										>
											{item.icon && <item.icon className="size-4" />}
											{item.label}
										</Link>
									);
								})}
							</nav>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
