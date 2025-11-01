import { useState } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleListProps {
	items: string[];
	threshold?: number;
	className?: string;
	itemClassName?: string;
	emptyMessage?: string;
}

export function CollapsibleList({
	items,
	threshold = 5,
	className,
	itemClassName = "text-sm text-muted-foreground",
	emptyMessage = "No items",
}: CollapsibleListProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const shouldCollapse = items.length > threshold;
	const visibleItems = isExpanded ? items : items.slice(0, threshold);
	const hiddenCount = items.length - threshold;

	if (items.length === 0) {
		return <div className="text-muted-foreground text-sm">{emptyMessage}</div>;
	}

	return (
		<div className={cn("space-y-1", className)}>
			{visibleItems.map((item) => (
				<div key={item} className={itemClassName}>
					{item}
				</div>
			))}

			{shouldCollapse && !isExpanded && (
				<button
					onClick={() => setIsExpanded(true)}
					type="button"
					className="mt-2 flex cursor-pointer items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
				>
					+{hiddenCount} more
				</button>
			)}

			{shouldCollapse && isExpanded && (
				<button
					onClick={() => setIsExpanded(false)}
					type="button"
					className="mt-2 cursor-pointer text-muted-foreground text-xs transition-colors hover:text-foreground"
				>
					Show less
				</button>
			)}
		</div>
	);
}
