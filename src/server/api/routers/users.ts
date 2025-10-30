import { UserInputSchema } from "prisma/generated/schemas";
import z from "zod";
import { Permission } from "@/lib/permissions";
import { createTRPCRouter } from "@/server/api/trpc";
import { permissionProcedure } from "../permissions";

const USER_OMIT_FIELDS = {
	rsvps: true,
	season: true,
	accounts: true,
	sessions: true,
	events: true,
	emailVerified: true,
} as const;

export const ZUpdateUser = UserInputSchema.omit(USER_OMIT_FIELDS).extend({
	id: z.string(),
});

export const usersRouter = createTRPCRouter({
	me: permissionProcedure(Permission.ReadOwnProfile).query(async ({ ctx }) => {
		return ctx.db.user.findUnique({
			where: { id: ctx.session.user.id },
		});
	}),

	updateMe: permissionProcedure(Permission.UpdateOwnProfile)
		.input(z.object({ name: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.user.update({
				where: { id: ctx.session.user.id },
				data: input,
			});
			return res;
		}),

	list: permissionProcedure(Permission.ReadUsers).query(async ({ ctx }) => {
		return ctx.db.user.findMany();
	}),

	get: permissionProcedure(Permission.ReadUsers)
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			return ctx.db.user.findUnique({
				where: { id: input.id },
			});
		}),

	update: permissionProcedure(Permission.UpdateUsers)
		.input(ZUpdateUser)
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.user.update({
				where: { id: input.id },
				data: input,
			});
			return res;
		}),

	updateMany: permissionProcedure(Permission.UpdateUsers)
		.input(z.array(ZUpdateUser))
		.mutation(async ({ ctx, input }) => {
			return ctx.db.$transaction(
				input.map((userData) =>
					ctx.db.user.update({
						where: { id: userData.id },
						data: userData,
					}),
				),
			);
		}),

	delete: permissionProcedure(Permission.DeleteUsers)
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const res = await ctx.db.user.delete({
				where: { id: input.id },
			});
			return res;
		}),

	deleteMany: permissionProcedure(Permission.DeleteUsers)
		.input(z.array(z.object({ id: z.string() })))
		.mutation(async ({ ctx, input }) => {
			return ctx.db.$transaction(
				input.map((userData) =>
					ctx.db.user.delete({
						where: { id: userData.id },
					}),
				),
			);
		}),
});
