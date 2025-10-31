import { auth } from "@/server/auth";

export default async function HomePage() {
	const session = await auth();
	return (
		<div className="container mx-auto mt-8 px-4">
			<pre>{JSON.stringify(session, null, 2)}</pre>
		</div>
	);
}
