import { cn } from "@/lib/utils";

type EmoticonType =
	| "celebrate"
	| "salute"
	| "warning"
	| "info"
	| "check"
	| "cross"
	| "smile"
	| "question"
	| "settings"
	| "chevron"
	| "error";

interface EmoticonProps {
	type: EmoticonType;
	className?: string;
}

const emoticons: Record<EmoticonType, { icon: string; style: string }> = {
	celebrate: { icon: "\\o/", style: "inline-block" },
	salute: { icon: "o7", style: "inline-block" },
	warning: { icon: "/!\\", style: "text-yellow-500 font-bold" },
	info: { icon: "[i]", style: "text-info font-semibold" },
	cross: { icon: "×", style: "text-destructive font-bold" },
	check: { icon: "✓", style: "text-success font-bold" },
	error: {
		icon: "✗",
		style: "text-destructive font-bold",
	},
	question: {
		icon: "?",
		style: "text-muted-foreground text-bold -translate-y-0.5",
	},
	settings: {
		icon: "⚙",
		style: "text-muted-foreground font-bold text-2xl -translate-y-2.5",
	},
	smile: {
		icon: ":^)",
		style: "text-success/90 rotate-90 font-bold -translate-y-1",
	},
	chevron: {
		icon: ">",
		style: "text-destructive font-bold text-lg -translate-y-[.38em]",
	},
};

export function Emoticon({ type, className }: EmoticonProps) {
	const emoticon = emoticons[type];

	return (
		<span className={cn("font-mono", emoticon.style, className)}>
			{emoticon.icon}
		</span>
	);
}
