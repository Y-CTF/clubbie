import { cn } from "@/lib/utils";

type EmoticonType =
	| "celebrate"
	| "salute"
	| "warning"
	| "info"
	| "check"
	| "cross"
	| "smile";

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
	smile: { icon: ":-)", style: "text-green-500" },
};

export function Emoticon({ type, className }: EmoticonProps) {
	const emoticon = emoticons[type];

	return (
		<span className={cn("font-mono", emoticon.style, className)}>
			{emoticon.icon}
		</span>
	);
}
