import { EventInputSchema } from "prisma/generated/schemas";
import z from "zod";
import { Permission } from "@/lib/permissions";
import { createTRPCRouter } from "@/server/api/trpc";
import { permissionProcedure } from "../permissions";

const EVENT_OMIT_FIELDS = {
	rsvps: true,
	season: true,
} as const;

export const ZCreateEvent = EventInputSchema.omit(EVENT_OMIT_FIELDS);
export const ZUpdateEvent = EventInputSchema.omit(EVENT_OMIT_FIELDS).extend({
	id: z.string(),
});

export const eventsRouter = createTRPCRouter({
	create: permissionProcedure(Permission.CreateEvents)
		.input(ZCreateEvent)
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.event.create({
				data: {
					...input,
					createdById: ctx.session.user.id,
					seasonId: input.seasonId,
				},
			});
			return res;
		}),

	read: permissionProcedure(Permission.ReadEvents).query(async ({ ctx }) => {
		const events = await ctx.db.event.findMany({
			include: {
				season: true,
				createdBy: true,
				rsvps: true,
			},
		});
		return events;
	}),

	update: permissionProcedure(Permission.UpdateEvents)
		.input(ZUpdateEvent)
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.event.update({
				where: { id: input.id },
				data: {
					...input,
					seasonId: input.seasonId,
				},
			});
			return res;
		}),

	delete: permissionProcedure(Permission.DeleteEvents)
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.event.delete({
				where: { id: input.id },
			});
			return res;
		}),
});
