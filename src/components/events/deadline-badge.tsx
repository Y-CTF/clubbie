type DeadlineStatus = "passed" | "urgent" | "approaching" | null;

function getDeadlineStatus(deadline: Date | null): DeadlineStatus {
	if (!deadline) return null;

	const now = new Date();
	const hoursUntilDeadline =
		(deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

	if (hoursUntilDeadline < 0) return "passed";
	if (hoursUntilDeadline < 24) return "urgent";
	if (hoursUntilDeadline < 72) return "approaching";

	return null;
}

interface DeadlineBadgeProps {
	deadline: Date | null;
}

export function DeadlineBadge({ deadline }: DeadlineBadgeProps) {
	const deadlineStatus = getDeadlineStatus(deadline);

	if (!deadlineStatus) return null;

	return (
		<div
			className={`absolute right-0 px-1.5 py-0.5 font-semibold text-xs ${
				deadlineStatus === "passed"
					? "bg-destructive/20 text-destructive"
					: deadlineStatus === "urgent"
						? "bg-destructive/25 text-destructive"
						: "bg-warning/20 text-warning"
			}`}
		>
			{deadlineStatus === "passed"
				? "Passed"
				: deadlineStatus === "urgent"
					? "Today"
					: "Soon"}
		</div>
	);
}
