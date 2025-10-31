export interface NavItem {
	label: string;
	href: string;
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
