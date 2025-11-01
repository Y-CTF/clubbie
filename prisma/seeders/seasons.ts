import type { PrismaClient } from "@prisma/client";

export async function createSeasons(prisma: PrismaClient, count: number) {
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
