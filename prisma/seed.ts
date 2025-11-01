import { PrismaClient } from "@prisma/client";

import { parseArgs } from "./seeders/config";
import { clearDatabase } from "./seeders/database";
import { createSeasonEvents, createStandaloneEvents } from "./seeders/events";
import { generateRsvps } from "./seeders/rsvps";
import { createSeasons } from "./seeders/seasons";
import { createMembers } from "./seeders/users";

const prisma = new PrismaClient();

async function main() {
	const config = parseArgs();

	console.log("🌱 Seeding database");

	if (config.clearExisting) {
		await clearDatabase(prisma);
	}

	const seasons = await createSeasons(prisma, config.numSeasons);
	const activeSeason = seasons[0];

	const members = await createMembers(
		prisma,
		config.numMembers,
		activeSeason?.id,
	);

	// use members as event creators
	const creatorIds = members.map((u) => u.id);

	const seasonEvents =
		config.numEvents > 0 && activeSeason
			? await createSeasonEvents(
					prisma,
					config.numEvents,
					activeSeason.id,
					creatorIds,
				)
			: [];

	const standaloneEvents =
		config.numStandaloneEvents > 0
			? await createStandaloneEvents(
					prisma,
					config.numStandaloneEvents,
					creatorIds,
				)
			: [];

	const allEvents = [...seasonEvents, ...standaloneEvents];

	if (allEvents.length > 0) {
		console.log(
			`🎉 Created ${allEvents.length} events (${seasonEvents.length} in season, ${standaloneEvents.length} standalone)`,
		);
	}

	let rsvps = [];
	if (config.generateRsvps && allEvents.length > 0 && members.length > 0) {
		rsvps = await generateRsvps(
			prisma,
			allEvents,
			members.map((m) => m.id),
		);
	}

	console.log("\nCreated:");
	console.log(`  - ${members.length} members`);
	console.log(`  - ${seasons.length} season(s)`);
	console.log(
		`  - ${allEvents.length} events (${seasonEvents.length} in season, ${standaloneEvents.length} standalone)`,
	);
	if (config.generateRsvps) {
		console.log(`  - ${rsvps.length} RSVPs`);
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
