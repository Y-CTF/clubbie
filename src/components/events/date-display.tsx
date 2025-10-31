"use client";

interface DateDisplayProps {
	date: Date;
	label: string;
}

export function DateDisplay({ date, label }: DateDisplayProps) {
	const formatted = new Intl.DateTimeFormat(undefined, {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);

	return (
		<div>
			<p className="text-muted-foreground text-sm">{label}</p>
			<p className="font-medium">{formatted}</p>
		</div>
	);
}
