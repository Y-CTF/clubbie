import {
	type UserPureType,
	type UserRole,
	UserRoleSchema,
	type UserStatus,
} from "prisma/generated/schemas";

export enum Permission {
	// profile
	ReadOwnProfile,
	UpdateOwnProfile,

	// rsvp
	ReadRSVPs,
	UpdateOwnRSVP,
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
}

const PENDING = [Permission.ReadOwnProfile];
const ALUMNI = [...PENDING, Permission.UpdateOwnProfile, Permission.ReadEvents];
const ACTIVE = [...ALUMNI, Permission.UpdateOwnRSVP, Permission.ReadRSVPs];

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
	user: Pick<UserPureType, "role" | "status">,
	permission: Permission,
): boolean {
	if (user.role === UserRoleSchema.enum.ADMIN) {
		return true;
	}

	const rolePermissions = PERMISSIONS.role[user.role] || [];
	const statusPermissions = PERMISSIONS.status[user.status] || [];

	return (
		rolePermissions.includes(permission) ||
		statusPermissions.includes(permission)
	);
}
