import { SeasonInputSchema } from "prisma/generated/schemas";
import z from "zod";
import { Permission } from "@/lib/permissions";
import { createTRPCRouter } from "@/server/api/trpc";
import { permissionProcedure } from "../permissions";

const SEASON_OMIT_FIELDS = {
	users: true,
	events: true,
} as const;

export const ZCreateSeason = SeasonInputSchema.omit(SEASON_OMIT_FIELDS);
export const ZUpdateSeason = SeasonInputSchema.omit(SEASON_OMIT_FIELDS).extend({
	id: z.string(),
});

export const seasonsRouter = createTRPCRouter({
	create: permissionProcedure(Permission.CreateSeasons)
		.input(ZCreateSeason)
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.season.create({
				data: {
					...input,
				},
			});
			return res;
		}),

	list: permissionProcedure(Permission.ReadSeasons).query(async ({ ctx }) => {
		const seasons = await ctx.db.season.findMany({
			include: {
				users: true,
				events: true,
			},
		});
		return seasons;
	}),

	get: permissionProcedure(Permission.ReadSeasons)
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const season = await ctx.db.season.findUnique({
				where: { id: input.id },
				include: {
					users: true,
					events: true,
				},
			});
			return season;
		}),

	update: permissionProcedure(Permission.UpdateSeasons)
		.input(ZUpdateSeason)
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.season.update({
				where: { id: input.id },
				data: {
					...input,
				},
			});
			return res;
		}),

	delete: permissionProcedure(Permission.DeleteSeasons)
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.season.delete({
				where: { id: input.id },
			});
			return res;
		}),
});
