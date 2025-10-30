import { TRPCError } from "@trpc/server";
import { hasPermission, type Permission } from "@/lib/permissions";
import { protectedProcedure } from "./trpc";

export const permissionProcedure = (permission: Permission) =>
	protectedProcedure.use(async ({ ctx, next }) => {
		if (!hasPermission(ctx.session.user, permission)) {
			throw new TRPCError({ code: "FORBIDDEN" });
		}
		return next({ ctx });
	});
