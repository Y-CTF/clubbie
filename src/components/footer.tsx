import { Typography } from "./ui/typography";

export default function Footer() {
	return (
		<footer className="my-4 p-4 text-center text-muted-foreground text-sm">
			duct-taped by{" "}
			<Typography.Link
				href="https://yctf.ch"
				className="text-muted-foreground underline transition-colors hover:text-primary"
			>
				Y-CTF
			</Typography.Link>
		</footer>
	);
}
