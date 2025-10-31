import { PrismaClient, RSVPStatus, UserRole, UserStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Configuration interface
interface SeedConfig {
	clearExisting: boolean;
	numMembers: number;
	numSeasons: number;
	numEvents: number;
	numStandaloneEvents: number;
	generateRsvps: boolean;
}

// Parse command line arguments
function parseArgs(): SeedConfig {
	const args = process.argv.slice(2);
	const config: SeedConfig = {
		clearExisting: true,
		numMembers: 5,
		numSeasons: 1,
		numEvents: 4,
		numStandaloneEvents: 2,
		generateRsvps: true,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const nextArg = args[i + 1];

		switch (arg) {
			case "--no-clear":
				config.clearExisting = false;
				break;
			case "--members":
				config.numMembers = parseInt(nextArg || "5", 10);
				i++;
				break;
			case "--seasons":
				config.numSeasons = parseInt(nextArg || "1", 10);
				i++;
				break;
			case "--events":
				config.numEvents = parseInt(nextArg || "4", 10);
				i++;
				break;
			case "--standalone-events":
				config.numStandaloneEvents = parseInt(nextArg || "2", 10);
				i++;
				break;
			case "--no-rsvps":
				config.generateRsvps = false;
				break;
			case "--help":
			case "-h":
				printHelp();
				process.exit(0);
				break;
		}
	}

	return config;
}

function printHelp() {
	console.log(`
🌱 clubbie Seed Script

Usage: pnpm db:seed [options]

Options:
  --no-clear              Don't clear existing data before seeding
  --members <number>      Number of regular members to create (default: 5)
  --seasons <number>      Number of seasons to create (default: 1)
  --events <number>       Number of season events to create (default: 4)
  --standalone-events <n> Number of standalone events to create (default: 2)
  --no-rsvps              Don't generate RSVPs
  -h, --help             Show this help message

Examples:
  pnpm db:seed
  pnpm db:seed --members 10 --events 8
  pnpm db:seed --no-clear --members 3
  pnpm db:seed --seasons 2 --events 6 --standalone-events 3
`);
}

// Helper functions for generating seed data
async function clearDatabase() {
	await prisma.rSVP.deleteMany();
	await prisma.event.deleteMany();
	await prisma.season.deleteMany();
	await prisma.user.deleteMany();
	console.log("🧹 Cleared existing data");
}

async function createAdmin(seasonId?: string) {
	const admin = await prisma.user.create({
		data: {
			email: "admin@clubbie.test",
			name: "Admin User",
			role: UserRole.ADMIN,
			status: UserStatus.ACTIVE,
			emailVerified: new Date(),
			seasonId,
		},
	});
	console.log("👤 Created admin:", admin.email);
	return admin;
}

async function createMembers(count: number, seasonId?: string) {
	const memberNames = [
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
		{
			name: "Nina Patel",
			email: "nina@clubbie.test",
			status: UserStatus.ACTIVE,
		},
		{
			name: "Oscar Kim",
			email: "oscar@clubbie.test",
			status: UserStatus.ACTIVE,
		},
	];

	const members = [];
	for (let i = 0; i < Math.min(count, memberNames.length); i++) {
		const memberData = memberNames[i]!;
		const member = await prisma.user.create({
			data: {
				email: memberData.email,
				name: memberData.name,
				role: UserRole.MEMBER,
				status: memberData.status,
				emailVerified: new Date(),
				// Alumni don't get assigned to current season
				seasonId:
					memberData.status !== UserStatus.ALUMNI ? seasonId : undefined,
			},
		});
		members.push(member);
	}

	// If we need more members than predefined names, generate generic ones
	for (let i = memberNames.length; i < count; i++) {
		const member = await prisma.user.create({
			data: {
				email: `member${i + 1}@clubbie.test`,
				name: `Member ${i + 1}`,
				role: UserRole.MEMBER,
				status: UserStatus.ACTIVE,
				emailVerified: new Date(),
				seasonId,
			},
		});
		members.push(member);
	}

	console.log(`👥 Created ${members.length} members`);
	return members;
}

async function createSeasons(count: number) {
	const seasons = [];
	const currentYear = new Date().getFullYear();

	for (let i = 0; i < count; i++) {
		const startYear = currentYear + i;
		const endYear = startYear + 1;

		const season = await prisma.season.create({
			data: {
				name: `S${i + 1} ${startYear.toString().slice(-2)}-${endYear.toString().slice(-2)}`,
				start: new Date(`${startYear}-09-01`),
				end: new Date(`${endYear}-06-30`),
				active: i === 0, // Only first season is active
			},
		});
		seasons.push(season);
	}

	console.log(`📅 Created ${seasons.length} season(s)`);
	return seasons;
}

async function createSeasonEvents(
	count: number,
	seasonId: string,
	creatorIds: string[],
) {
	const eventTemplates = [
		{
			name: "Kickoff Meeting",
			description:
				"Welcome to the new season! Let's discuss our goals and plans.",
		},
		{
			name: "Workshop: Web Security Basics",
			description: "Learn the fundamentals of web application security.",
		},
		{
			name: "CTF Competition Practice",
			description: "Practice for the upcoming CTF competition.",
		},
		{
			name: "Guest Speaker: Industry Professional",
			description: "Special talk from a cybersecurity industry professional.",
		},
		{
			name: "Binary Exploitation Workshop",
			description: "Deep dive into binary exploitation techniques.",
		},
		{
			name: "Crypto Challenge Night",
			description: "Solve cryptography challenges together.",
		},
		{
			name: "Reverse Engineering Session",
			description: "Learn reverse engineering fundamentals.",
		},
		{
			name: "Web Exploitation Lab",
			description: "Hands-on practice with web vulnerabilities.",
		},
		{
			name: "Forensics Workshop",
			description: "Digital forensics and incident response.",
		},
		{
			name: "Network Security Session",
			description: "Understanding network protocols and security.",
		},
		{
			name: "Mid-Season Social",
			description: "Casual hangout with club members.",
		},
		{
			name: "Final Competition Prep",
			description: "Last practice before the big competition.",
		},
	];

	const events = [];
	for (let i = 0; i < count; i++) {
		const template = eventTemplates[i % eventTemplates.length]!;
		const creatorId = creatorIds[i % creatorIds.length]!;

		const event = await prisma.event.create({
			data: {
				name:
					count > eventTemplates.length
						? `${template.name} ${Math.floor(i / eventTemplates.length) + 1}`
						: template.name,
				description: template.description,
				seasonId,
				createdById: creatorId,
			},
		});
		events.push(event);
	}

	return events;
}

async function createStandaloneEvents(count: number, creatorIds: string[]) {
	const eventTemplates = [
		{
			name: "Summer Social Event",
			description: "Informal meetup over the summer break.",
		},
		{
			name: "Alumni Networking Night",
			description: "Connect with alumni and learn about career opportunities.",
		},
		{
			name: "Open House",
			description: "Welcome new members and showcase the club.",
		},
		{
			name: "Off-Season Workshop",
			description: "Keep skills sharp during the break.",
		},
		{
			name: "Community Outreach",
			description: "Cybersecurity awareness event for the community.",
		},
	];

	const events = [];
	for (let i = 0; i < count; i++) {
		const template = eventTemplates[i % eventTemplates.length]!;
		const creatorId = creatorIds[i % creatorIds.length]!;

		const event = await prisma.event.create({
			data: {
				name:
					count > eventTemplates.length
						? `${template.name} ${Math.floor(i / eventTemplates.length) + 1}`
						: template.name,
				description: template.description,
				createdById: creatorId,
			},
		});
		events.push(event);
	}

	return events;
}

interface EventWithId {
	id: string;
}

async function generateRsvps(events: EventWithId[], userIds: string[]) {
	const rsvps = [];

	for (const event of events) {
		// Randomly select 30-70% of users to RSVP for each event
		const numRsvps = Math.floor(userIds.length * (0.3 + Math.random() * 0.4));
		const shuffledUsers = [...userIds].sort(() => Math.random() - 0.5);

		for (let i = 0; i < numRsvps; i++) {
			const userId = shuffledUsers[i]!;
			// 60% GOING, 25% MAYBE, 15% NOT_GOING
			const rand = Math.random();
			const status =
				rand < 0.6
					? RSVPStatus.GOING
					: rand < 0.85
						? RSVPStatus.MAYBE
						: RSVPStatus.NOT_GOING;

			try {
				const rsvp = await prisma.rSVP.create({
					data: {
						eventId: event.id,
						userId,
						status,
					},
				});
				rsvps.push(rsvp);
			} catch {
				// Skip if RSVP already exists
			}
		}
	}

	console.log(`✅ Created ${rsvps.length} RSVPs`);
	return rsvps;
}

async function main() {
	const config = parseArgs();

	console.log("🌱 Starting seed with configuration:");
	console.log(JSON.stringify(config, null, 2));
	console.log();

	if (config.clearExisting) {
		await clearDatabase();
	}

	// Create Seasons
	const seasons = await createSeasons(config.numSeasons);
	const activeSeason = seasons[0]; // First season is always active

	// Create Admin User
	const admin = await createAdmin(activeSeason?.id);

	// Create Regular Members
	const members = await createMembers(config.numMembers, activeSeason?.id);

	// Combine admin and members for event creation
	const allUsers = [admin, ...members];
	const creatorIds = allUsers.map((u) => u.id);

	// Create Events
	const seasonEvents =
		config.numEvents > 0 && activeSeason
			? await createSeasonEvents(config.numEvents, activeSeason.id, creatorIds)
			: [];

	const standaloneEvents =
		config.numStandaloneEvents > 0
			? await createStandaloneEvents(config.numStandaloneEvents, creatorIds)
			: [];

	const allEvents = [...seasonEvents, ...standaloneEvents];

	if (allEvents.length > 0) {
		console.log(
			`🎉 Created ${allEvents.length} events (${seasonEvents.length} in season, ${standaloneEvents.length} standalone)`,
		);
	}

	// Generate RSVPs
	if (config.generateRsvps && allEvents.length > 0 && members.length > 0) {
		await generateRsvps(
			allEvents,
			members.map((m) => m.id),
		);
	}

	// Summary
	console.log("\n🎊 Seed completed successfully!");
	console.log("\nCreated:");
	console.log(`  - 1 admin user (${admin.email})`);
	console.log(`  - ${members.length} regular members`);
	console.log(`  - ${seasons.length} season(s)`);
	console.log(
		`  - ${allEvents.length} events (${seasonEvents.length} in season, ${standaloneEvents.length} standalone)`,
	);
	if (config.generateRsvps) {
		console.log(`  - RSVPs generated`);
	}
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error("❌ Seed failed:", e);
		await prisma.$disconnect();
		process.exit(1);
	});
