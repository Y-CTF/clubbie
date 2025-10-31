import type { Provider } from "next-auth/providers";

export const EduIDProvider = ({
	clientId,
	clientSecret,
	test = false,
}: {
	clientId: string;
	clientSecret: string;
	test?: boolean;
}): Provider<EduIDProfile> => ({
	id: "eduid",
	name: `EduID${test ? " Test" : ""}`,
	type: "oidc",
	authorization: {
		params: {
			scope: "openid profile email https://login.eduid.ch/authz/User.Read",
		},
	},
	clientId,
	clientSecret,
	issuer: test ? "https://login.test.eduid.ch/" : "https://login.eduid.ch/",
	wellKnown: test
		? "https://login.test.eduid.ch/.well-known/openid-configuration"
		: "https://login.eduid.ch/.well-known/openid-configuration",
	idToken: false,
	checks: ["pkce", "state"],
	profile: (p) => {
		return {
			id: p.sub,
			name: p.name,
			email: p.email,
			homeOrganization: p.swissEduPersonHomeOrganization,
		};
	},
});

export type EduIDProfile = {
	email: string;
	email_verified: boolean;
	swissEduPersonHomeOrganization: string;
	name: string;
	given_name: string;
	family_name: string;
	sub: string;
};
