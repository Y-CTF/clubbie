import { EventKind, type PrismaClient } from "@prisma/client";

interface EventTemplate {
	name: string;
	description: string;
	kind: EventKind;
}

const SEASON_EVENT_TEMPLATES: EventTemplate[] = [
	{
		name: "Kickoff Meeting",
		description:
			"Welcome to the new season! Let's discuss our goals and plans.",
		kind: EventKind.MEETING,
	},
	{
		name: "Workshop: Web Security Basics",
		description: "Learn the fundamentals of web application security.",
		kind: EventKind.WORKSHOP,
	},
	{
		name: "CTF Competition Practice",
		description: "Practice for the upcoming CTF competition.",
		kind: EventKind.COMPETITION,
	},
	{
		name: "Guest Speaker: Industry Professional",
		description: "Special talk from a cybersecurity industry professional.",
		kind: EventKind.CONFERENCE,
	},
	{
		name: "Binary Exploitation Workshop",
		description: "Deep dive into binary exploitation techniques.",
		kind: EventKind.WORKSHOP,
	},
	{
		name: "Crypto Challenge Night",
		description: "Solve cryptography challenges together.",
		kind: EventKind.COMPETITION,
	},
	{
		name: "Reverse Engineering Session",
		description: "Learn reverse engineering fundamentals.",
		kind: EventKind.WORKSHOP,
	},
	{
		name: "Web Exploitation Lab",
		description: "Hands-on practice with web vulnerabilities.",
		kind: EventKind.WORKSHOP,
	},
	{
		name: "Forensics Workshop",
		description: "Digital forensics and incident response.",
		kind: EventKind.WORKSHOP,
	},
	{
		name: "Network Security Session",
		description: "Understanding network protocols and security.",
		kind: EventKind.WORKSHOP,
	},
	{
		name: "Mid-Season Social",
		description: "Casual hangout with club members.",
		kind: EventKind.SOCIAL,
	},
	{
		name: "Final Competition Prep",
		description: "Last practice before the big competition.",
		kind: EventKind.COMPETITION,
	},
];

const STANDALONE_EVENT_TEMPLATES: EventTemplate[] = [
	{
		name: "Summer Social Event",
		description: "Informal meetup over the summer break.",
		kind: EventKind.SOCIAL,
	},
	{
		name: "Alumni Networking Night",
		description: "Connect with alumni and learn about career opportunities.",
		kind: EventKind.SOCIAL,
	},
	{
		name: "Open House",
		description: "Welcome new members and showcase the club.",
		kind: EventKind.MEETING,
	},
	{
		name: "Off-Season Workshop",
		description: "Keep skills sharp during the break.",
		kind: EventKind.WORKSHOP,
	},
	{
		name: "Community Outreach",
		description: "Cybersecurity awareness event for the community.",
		kind: EventKind.CONFERENCE,
	},
];

interface CreateEventParams {
	template: EventTemplate;
	creatorId: string;
	daysOffset: number;
	isCompetition: boolean;
	seasonId?: string;
}

function createEventDate(daysOffset: number, hours: number = 18): Date {
	const date = new Date();
	date.setDate(date.getDate() + daysOffset);
	date.setHours(hours, 0, 0, 0);
	return date;
}

function createDeadlineDate(eventDate: Date, daysBeforeEvent: number): Date {
	const deadline = new Date(eventDate);
	deadline.setDate(deadline.getDate() - daysBeforeEvent);
	deadline.setHours(23, 59, 59, 999);
	return deadline;
}

async function createEvent(
	prisma: PrismaClient,
	params: CreateEventParams,
	endDateHours: number,
) {
	const eventDate = createEventDate(params.daysOffset);
	const endDate = new Date(eventDate);
	endDate.setHours(eventDate.getHours() + endDateHours, 0, 0, 0);

	const daysBeforeDeadline = params.isCompetition ? 3 : 1;
	const deadline = createDeadlineDate(eventDate, daysBeforeDeadline);

	return prisma.event.create({
		data: {
			name: params.template.name,
			description: params.template.description,
			kind: params.template.kind,
			start: eventDate,
			end: endDate,
			deadline,
			seasonId: params.seasonId,
			createdById: params.creatorId,
		},
	});
}

export async function createSeasonEvents(
	prisma: PrismaClient,
	count: number,
	seasonId: string,
	creatorIds: string[],
) {
	const events = [];
	const baseEventCount = SEASON_EVENT_TEMPLATES.length;

	for (let i = 0; i < count; i++) {
		const template = SEASON_EVENT_TEMPLATES[i % baseEventCount]!;
		const creatorId = creatorIds[i % creatorIds.length]!;
		const isCompetition = template.kind === EventKind.COMPETITION;

		const event = await createEvent(
			prisma,
			{
				template,
				creatorId,
				daysOffset: i * 7,
				isCompetition,
				seasonId,
			},
			2, // 2-hour events
		);
		events.push(event);
	}

	return events;
}

export async function createStandaloneEvents(
	prisma: PrismaClient,
	count: number,
	creatorIds: string[],
) {
	const events = [];
	const baseEventCount = STANDALONE_EVENT_TEMPLATES.length;

	for (let i = 0; i < count; i++) {
		const template = STANDALONE_EVENT_TEMPLATES[i % baseEventCount]!;
		const creatorId = creatorIds[i % creatorIds.length]!;
		const isCompetition = template.kind === EventKind.COMPETITION;

		const event = await createEvent(
			prisma,
			{
				template,
				creatorId,
				daysOffset: 30 + i * 20,
				isCompetition,
			},
			2.5, // 2.5-hour events
		);
		events.push(event);
	}

	return events;
}
