import { PrismaAdapter } from "@auth/prisma-adapter";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import {
	UserRoleSchema,
	UserStatusSchema,
	type UserRole,
	type UserStatus,
} from "prisma/generated/schemas";
import { db } from "@/server/db";
import { EduIDProvider } from "./eduid";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "auth/config" });

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
	interface Session extends DefaultSession {
		user: {
			id: string;
			name: string;
			email: string;
			role: UserRole;
			status: UserStatus;
			homeOrganization: string;
		};
	}
}

function adminFirstUserAdapter(): Adapter {
	const base = PrismaAdapter(db);

	return {
		...base,
		createUser: async (data) => {
			const userCount = await db.user.count();
			const isFirstUser = userCount === 0;

			const user = await db.user.create({
				data: {
					...data,
					...(isFirstUser && {
						role: UserRoleSchema.enum.ADMIN,
						status: UserStatusSchema.enum.ACTIVE,
					}),
				},
			});

			// log the creation of the first user
			if (isFirstUser) {
				log.info(`First user created with ADMIN role: ${user.email}`);
			}

			return {
				id: user.id,
				name: user.name,
				email: user.email!,
				emailVerified: user.emailVerified,
			};
		},
	};
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
	providers: [
		EduIDProvider({
			clientId: process.env.AUTH_EDUID_ID!,
			clientSecret: process.env.AUTH_EDUID_SECRET!,
			test: process.env.AUTH_EDUID_TEST === "true",
		}),
	],
	adapter: adminFirstUserAdapter(),
	pages: {
		signIn: "/signin",
		error: "/error",
	},
	callbacks: {
		session: ({ session, user }) => ({
			...session,
			user: {
				...session.user,
				id: user.id,
			},
		}),
	},
} satisfies NextAuthConfig;
