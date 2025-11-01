export interface SeedConfig {
	clearExisting: boolean;
	numMembers: number;
	numSeasons: number;
	numEvents: number;
	numStandaloneEvents: number;
	generateRsvps: boolean;
}

const DEFAULT_CONFIG: SeedConfig = {
	clearExisting: true,
	numMembers: 5,
	numSeasons: 1,
	numEvents: 4,
	numStandaloneEvents: 2,
	generateRsvps: true,
};

export function parseArgs(): SeedConfig {
	const args = process.argv.slice(2);
	const config: SeedConfig = { ...DEFAULT_CONFIG };

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

export function printHelp() {
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
