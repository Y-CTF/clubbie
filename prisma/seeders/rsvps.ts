import { type PrismaClient, RSVPStatus } from "@prisma/client";

interface EventWithId {
	id: string;
}

const RSVP_PERCENTAGE_RANGE = { min: 0.3, max: 0.7 };
const RSVP_STATUS_DISTRIBUTION = {
	GOING: 0.6,
	MAYBE: 0.25,
	NOT_GOING: 0.15,
};

function selectRandomRsvpStatus(): RSVPStatus {
	const rand = Math.random();
	if (rand < RSVP_STATUS_DISTRIBUTION.GOING) {
		return RSVPStatus.GOING;
	} else if (
		rand <
		RSVP_STATUS_DISTRIBUTION.GOING + RSVP_STATUS_DISTRIBUTION.MAYBE
	) {
		return RSVPStatus.MAYBE;
	}
	return RSVPStatus.NOT_GOING;
}

function getRandomParticipantCount(userCount: number): number {
	const min = RSVP_PERCENTAGE_RANGE.min;
	const max = RSVP_PERCENTAGE_RANGE.max;
	return Math.floor(userCount * (min + Math.random() * (max - min)));
}

export async function generateRsvps(
	prisma: PrismaClient,
	events: EventWithId[],
	userIds: string[],
) {
	const rsvps = [];

	for (const event of events) {
		const numRsvps = getRandomParticipantCount(userIds.length);
		const shuffledUsers = [...userIds].sort(() => Math.random() - 0.5);

		for (let i = 0; i < numRsvps; i++) {
			const userId = shuffledUsers[i]!;
			const status = selectRandomRsvpStatus();

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
