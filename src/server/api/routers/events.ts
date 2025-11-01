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

	list: permissionProcedure(Permission.ReadEvents)
		.input(
			z.object({
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().default(9),
			}),
		)
		.query(async ({ ctx, input }) => {
			const skip = (input.page - 1) * input.limit;

			const [events, total] = await Promise.all([
				ctx.db.event.findMany({
					include: {
						season: true,
						createdBy: true,
						rsvps: {
							include: { user: true },
						},
					},
					skip,
					take: input.limit,
					orderBy: { start: "asc" },
				}),
				ctx.db.event.count(),
			]);

			const totalPages = Math.ceil(total / input.limit);

			return {
				events: events.map((event) => ({
					...event,
					rsvps: event.rsvps.map((rsvp) => ({
						...rsvp,
						user: rsvp.user.hiddenAttendance
							? { ...rsvp.user, name: null }
							: rsvp.user,
					})),
				})),
				pagination: {
					page: input.page,
					limit: input.limit,
					total,
					totalPages,
				},
			};
		}),

	get: permissionProcedure(Permission.ReadEvents)
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.db.event.findUnique({
				where: { id: input.id },
				include: {
					season: true,
					createdBy: true,
					rsvps: {
						include: { user: true },
					},
				},
			});

			if (!event) return null;

			return {
				...event,
				rsvps: event.rsvps.map((rsvp) => ({
					...rsvp,
					user: rsvp.user.hiddenAttendance
						? { ...rsvp.user, name: null }
						: rsvp.user,
				})),
			};
		}),

	update: permissionProcedure(Permission.UpdateEvents)
		.input(ZUpdateEvent)
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.event.update({
				where: { id: input.id },
				data: input,
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

	deleteMany: permissionProcedure(Permission.DeleteEvents)
		.input(z.object({ ids: z.array(z.string()) }))
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.event.deleteMany({
				where: { id: { in: input.ids } },
			});
			return res;
		}),
});
