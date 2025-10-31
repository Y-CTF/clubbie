import { auth } from "@/server/auth";
import { navigationConfig } from "./nav-config";
import { Navbar } from "./navbar";

export async function NavbarWrapper() {
	const session = await auth();

	return <Navbar items={navigationConfig} session={session} />;
}

export type { NavItem } from "./nav-config";
export { navigationConfig } from "./nav-config";
