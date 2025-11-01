import type { PrismaClient } from "@prisma/client";

export async function clearDatabase(prisma: PrismaClient) {
	await prisma.rSVP.deleteMany();
	await prisma.event.deleteMany();
	await prisma.season.deleteMany();
	await prisma.user.deleteMany();
	console.log("🧹 Cleared existing data");
}
