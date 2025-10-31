import { Typography } from "./ui/typography";

export default function Footer() {
	return (
		<footer className="mt-8 p-4 text-center text-muted-foreground text-sm">
			made by{" "}
			<Typography.Link
				href="https://yctf.ch"
				className="text-muted-foreground underline transition-colors hover:text-primary"
			>
				Y-CTF
			</Typography.Link>
			. no rights reserved.
			<br />
			do whatever you want.
		</footer>
	);
}
