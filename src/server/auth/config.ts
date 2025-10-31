import { PrismaAdapter } from "@auth/prisma-adapter";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import type { UserRole, UserStatus } from "prisma/generated/schemas";
import { db } from "@/server/db";
import { EduIDProvider } from "./eduid";

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
	adapter: PrismaAdapter(db),
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
