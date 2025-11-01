import { PrismaAdapter } from "@auth/prisma-adapter";
import { UserRole, UserStatus } from "@prisma/client";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { EduIDProvider } from "./eduid";

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
		// biome-ignore lint/suspicious/noExplicitAny: AdapterUser doesn't have all fields defined
		createUser: async (data: any) => {
			const user = await db.$transaction(async (tx) => {
				const hasAdmin = await tx.user.findFirst({
					where: { role: UserRole.ADMIN },
				});

				return tx.user.create({
					data: {
						...data,
						...(!hasAdmin && {
							role: UserRole.ADMIN,
							status: UserStatus.ACTIVE,
						}),
					},
				});
			});

			if (user.role === UserRole.ADMIN && data.role !== UserRole.ADMIN) {
				log.info(`No admin found, created user with ADMIN role: ${user.email}`);
			}

			return {
				id: user.id,
				name: user.name,
				email: user.email!,
				emailVerified: user.emailVerified,
				homeOrganization: user.homeOrganization,
				role: user.role,
				status: user.status,
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
			clientId: env.AUTH_EDUID_ID!,
			clientSecret: env.AUTH_EDUID_SECRET!,
			test: env.AUTH_EDUID_TEST === "true",
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
		signIn: async ({ user, profile }) => {
			log.debug(
				`User signed in: ${user.email} (ID: ${user.id}, Org: ${profile?.swissEduPersonHomeOrganization})`,
			);

			if (env.AUTH_EDUID_ORGANIZATIONS.length === 0) {
				log.warn(
					"No allowed organizations configured for edu-ID authentication.",
				);
				return true;
			}
			if (
				profile?.swissEduPersonHomeOrganization &&
				env.AUTH_EDUID_ORGANIZATIONS.includes(
					profile.swissEduPersonHomeOrganization as string,
				)
			) {
				return true;
			}
			log.info(
				`User's home organization not allowed: ${profile?.swissEduPersonHomeOrganization}`,
			);
			return false;
		},
	},
} satisfies NextAuthConfig;
