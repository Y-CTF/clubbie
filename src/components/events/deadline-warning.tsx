"use client";

import { Clock } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Emoticon } from "../emoticon";

interface DeadlineWarningProps {
	deadline: Date;
}

export function DeadlineWarning({ deadline }: DeadlineWarningProps) {
	const now = new Date();
	const hoursUntilDeadline =
		(deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

	const isPassed = hoursUntilDeadline < 0;
	const isUrgent = hoursUntilDeadline < 24;

	if (hoursUntilDeadline >= 72) return null;

	let message = "";
	let icon = <Clock className="h-5 w-5" />;
	let title = "Upcoming Deadline";
	let variant: "warning" | "destructive" = "warning";

	if (isPassed) {
		const hoursPassed = Math.abs(hoursUntilDeadline);
		message =
			hoursPassed >= 1
				? `Deadline passed ${Math.floor(hoursPassed)} hour${Math.floor(hoursPassed) !== 1 ? "s" : ""} ago`
				: "Deadline passed recently";
		icon = <Emoticon type="alertcircle" className="h-5 w-5 text-inherit" />;
		title = "Deadline Passed";
		variant = "destructive";
	} else if (isUrgent) {
		const hours = Math.floor(hoursUntilDeadline);
		message =
			hours > 0
				? `Deadline in ${hours} hour${hours !== 1 ? "s" : ""}`
				: "Deadline is today";
		icon = <Emoticon type="warning" className="h-5 w-5 text-inherit" />;
		title = "Urgent Deadline";
		variant = "warning";
	} else {
		const hours = Math.floor(hoursUntilDeadline);
		message = `Deadline in ${hours} hour${hours !== 1 ? "s" : ""}`;
	}

	return (
		<Banner icon={icon} title={title} message={message} variant={variant} />
	);
}
