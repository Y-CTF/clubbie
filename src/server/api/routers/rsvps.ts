import { RSVPInputSchema } from "prisma/generated/schemas";
import z from "zod";
import { Permission } from "@/lib/permissions";
import { createTRPCRouter } from "@/server/api/trpc";
import { permissionProcedure } from "../permissions";

export const rsvpsRouter = createTRPCRouter({
	me: permissionProcedure(Permission.ReadRSVPs)
		.input(z.object({ eventId: z.string() }))
		.query(async ({ ctx, input }) => {
			const rsvp = await ctx.db.rSVP.findUnique({
				where: {
					eventId_userId: {
						eventId: input.eventId,
						userId: ctx.session.user.id,
					},
				},
			});
			return rsvp;
		}),
	updateMe: permissionProcedure(Permission.UpdateOwnRSVPs)
		.input(RSVPInputSchema.omit({ event: true, user: true, userId: true }))
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.rSVP.upsert({
				where: {
					eventId_userId: {
						eventId: input.eventId,
						userId: ctx.session.user.id,
					},
				},
				create: {
					status: input.status,
					eventId: input.eventId,
					userId: ctx.session.user.id,
				},
				update: {
					status: input.status,
				},
			});
			return res;
		}),

	list: permissionProcedure(Permission.ReadRSVPs)
		.input(z.object({ eventId: z.string() }))
		.query(async ({ ctx, input }) => {
			const rsvps = await ctx.db.rSVP.findMany({
				where: { eventId: input.eventId },
				include: { user: true },
			});
			// filter out users with hiddenAttendance, but keep the RSVPs for counting
			return rsvps.map((rsvp) => ({
				...rsvp,
				user: rsvp.user.hiddenAttendance
					? { ...rsvp.user, name: null }
					: rsvp.user,
			}));
		}),

	listMe: permissionProcedure(Permission.ReadRSVPs).query(async ({ ctx }) => {
		const rsvps = await ctx.db.rSVP.findMany({
			where: { userId: ctx.session.user.id },
			include: { event: true },
		});
		return rsvps;
	}),

	deleteMe: permissionProcedure(Permission.UpdateOwnRSVPs)
		.input(z.object({ eventId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.rSVP.delete({
				where: {
					eventId_userId: {
						eventId: input.eventId,
						userId: ctx.session.user.id,
					},
				},
			});
			return res;
		}),
});
