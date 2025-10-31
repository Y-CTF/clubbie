import { type User, UserRole, type UserStatus } from "@prisma/client";

export enum Permission {
	// profile
	ReadOwnProfile,
	UpdateOwnProfile,

	// rsvp
	ReadRSVPs,
	UpdateOwnRSVPs,
	DeleteRSVPs,

	// events
	CreateEvents,
	ReadEvents,
	UpdateEvents,
	DeleteEvents,

	// users
	ReadUsers,
	UpdateUsers,
	DeleteUsers,

	// seasons
	ReadCurrentSeason,
	CreateSeasons,
	ReadSeasons,
	UpdateSeasons,
	DeleteSeasons,
}

const PENDING = [Permission.ReadOwnProfile];
const ALUMNI = [...PENDING, Permission.UpdateOwnProfile, Permission.ReadEvents];
const ACTIVE = [
	...ALUMNI,
	Permission.UpdateOwnRSVPs,
	Permission.ReadRSVPs,
	Permission.ReadCurrentSeason,
];

const MEMBER = [...ACTIVE];

export const PERMISSIONS: {
	status: { [k in UserStatus]: Permission[] };
	role: { [k in UserRole]: Permission[] };
} = {
	status: {
		PENDING,
		ALUMNI,
		ACTIVE,
	},
	role: {
		MEMBER,
		ADMIN: [], // bypassed
	},
};

export function hasPermission(
	user: Pick<User, "role" | "status"> | null | undefined,
	permission: Permission,
): boolean {
	if (!user) {
		return false;
	}
	if (user.role === UserRole.ADMIN) {
		return true;
	}

	const rolePermissions = PERMISSIONS.role[user.role] || [];
	const statusPermissions = PERMISSIONS.status[user.status] || [];

	return (
		rolePermissions.includes(permission) ||
		statusPermissions.includes(permission)
	);
}

export const usePermission =
	(user: Pick<User, "role" | "status"> | null | undefined) =>
	(permission: Permission): boolean => {
		if (!user) {
			return false;
		}
		return hasPermission(user, permission);
	};

export async function getServerPermissions(permission: Permission) {
	const { auth } = await import("@/server/auth");
	const session = await auth();

	if (!session?.user) {
		return false;
	}

	return hasPermission(session.user, permission);
}
