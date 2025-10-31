import { cn } from "@/lib/utils";

interface LogoProps {
	variant?: "icon" | "inline" | "banner";
	size?: "sm" | "md" | "lg";
	className?: string;
}

const iconSizeClasses = {
	sm: "size-8 text-sm",
	md: "size-12 text-lg",
	lg: "size-16 text-2xl",
};

const bannerSizeClasses = {
	sm: "h-8 px-3 text-sm",
	md: "h-12 px-5 text-lg",
	lg: "h-16 px-6 text-2xl",
};

export function Logo({ variant = "icon", size = "sm", className }: LogoProps) {
	if (variant === "banner") {
		return (
			<div
				className={cn(
					"flex items-center justify-center bg-linear-to-br from-primary to-primary/80 font-bold text-primary-foreground tracking-tight",
					bannerSizeClasses[size],
					className,
				)}
			>
				clubbie
			</div>
		);
	}

	if (variant === "inline") {
		const iconClasses = cn(
			"flex items-center justify-center bg-primary font-bold text-primary-foreground",
			iconSizeClasses[size],
		);

		return (
			<div className={cn("flex items-center gap-2", className)}>
				<div className={iconClasses}>
					<span>C</span>
				</div>
				<span className="font-bold text-lg tracking-tight">clubbie</span>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex items-center justify-center bg-primary font-bold text-primary-foreground",
				iconSizeClasses[size],
				className,
			)}
		>
			<span>C</span>
		</div>
	);
}
