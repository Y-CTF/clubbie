import type { PrismaClient, User } from "@prisma/client";
import { UserRole, UserStatus } from "@prisma/client";

const PREDEFINED_MEMBERS = [
	{
		name: "Alice Johnson",
		email: "alice@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{ name: "Bob Smith", email: "bob@clubbie.test", status: UserStatus.ACTIVE },
	{
		name: "Charlie Davis",
		email: "charlie@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{
		name: "Diana Martinez",
		email: "diana@clubbie.test",
		status: UserStatus.PENDING,
	},
	{
		name: "Evan Wilson",
		email: "evan@clubbie.test",
		status: UserStatus.ALUMNI,
	},
	{
		name: "Fiona Chen",
		email: "fiona@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{
		name: "George Taylor",
		email: "george@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{
		name: "Hannah Lee",
		email: "hannah@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{
		name: "Isaac Brown",
		email: "isaac@clubbie.test",
		status: UserStatus.PENDING,
	},
	{
		name: "Julia Garcia",
		email: "julia@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{
		name: "Kevin White",
		email: "kevin@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{
		name: "Laura Thompson",
		email: "laura@clubbie.test",
		status: UserStatus.ALUMNI,
	},
	{
		name: "Mike Anderson",
		email: "mike@clubbie.test",
		status: UserStatus.ACTIVE,
	},
	{ name: "Nina Patel", email: "nina@clubbie.test", status: UserStatus.ACTIVE },
	{ name: "Oscar Kim", email: "oscar@clubbie.test", status: UserStatus.ACTIVE },
];

const HOME_ORGANIZATION = "test.eduid.ch";
const HIDDEN_ATTENDANCE_CHANCE = 0.2; // 20% chance to hide attendance

export async function createMembers(
	prisma: PrismaClient,
	count: number,
	seasonId?: string,
): Promise<User[]> {
	const members = [];

	// Create members from predefined list
	for (let i = 0; i < Math.min(count, PREDEFINED_MEMBERS.length); i++) {
		const memberData = PREDEFINED_MEMBERS[i]!;
		const member = await prisma.user.create({
			data: {
				email: memberData.email,
				name: memberData.name,
				role: UserRole.MEMBER,
				status: memberData.status,
				emailVerified: new Date(),
				seasonId:
					memberData.status !== UserStatus.ALUMNI ? seasonId : undefined,
				homeOrganization: HOME_ORGANIZATION,
				hiddenAttendance: Math.random() < HIDDEN_ATTENDANCE_CHANCE,
			},
		});
		members.push(member);
	}

	// Generate additional members if needed
	for (let i = PREDEFINED_MEMBERS.length; i < count; i++) {
		const member = await prisma.user.create({
			data: {
				email: `member${i + 1}@clubbie.test`,
				name: `Member ${i + 1}`,
				role: UserRole.MEMBER,
				status: UserStatus.ACTIVE,
				emailVerified: new Date(),
				seasonId,
				homeOrganization: HOME_ORGANIZATION,
				hiddenAttendance: Math.random() < HIDDEN_ATTENDANCE_CHANCE,
			},
		});
		members.push(member);
	}

	console.log(`👥 Created ${members.length} members`);
	return members;
}
