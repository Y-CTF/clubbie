import type { LucideIcon } from "lucide-react";

export interface NavItem {
	label: string;
	href: string;
	icon?: LucideIcon;
	requiresAuth?: boolean;
	children?: NavItem[];
}

export const navigationConfig: NavItem[] = [
	{
		label: "Home",
		href: "/",
	},
	{
		label: "Events",
		href: "/events",
		requiresAuth: true,
	},
];
