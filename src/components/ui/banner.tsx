import type { ReactNode } from "react";

interface BannerProps {
	icon: ReactNode;
	title: string;
	message: string;
	variant?: "warning" | "destructive" | "info";
}

const variantStyles = {
	warning: {
		bg: "bg-warning/10",
		border: "border-warning/30",
		text: "text-warning",
	},
	destructive: {
		bg: "bg-destructive/10",
		border: "border-destructive/30",
		text: "text-destructive",
	},
	info: {
		bg: "bg-primary/10",
		border: "border-primary/30",
		text: "text-primary",
	},
};

export function Banner({
	icon,
	title,
	message,
	variant = "info",
}: BannerProps) {
	const styles = variantStyles[variant];

	return (
		<div
			className={`flex items-center gap-3 border p-4 ${styles.bg} ${styles.border}`}
		>
			<div className={styles.text}>{icon}</div>
			<div>
				<p className={`font-semibold ${styles.text}`}>{title}</p>
				<p className={`text-sm ${styles.text}/80`}>{message}</p>
			</div>
		</div>
	);
}
