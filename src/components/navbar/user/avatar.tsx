import type { Session } from "next-auth";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserAvatarProps {
	user: Session["user"];
	size?: "sm" | "md" | "lg";
}

export function UserAvatar({ user, size = "md" }: UserAvatarProps) {
	const getInitials = (name: string | null | undefined) => {
		if (!name) return "U";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	const sizeClasses = {
		sm: "size-8",
		md: "size-10",
		lg: "size-12",
	};

	const textSizeClasses = {
		sm: "text-xs",
		md: "text-sm",
		lg: "text-base",
	};

	return (
		<Avatar className={sizeClasses[size]}>
			<AvatarFallback
				className={`bg-linear-to-br from-primary to-primary/80 font-semibold text-primary-foreground ${textSizeClasses[size]}`}
			>
				{getInitials(user.name)}
			</AvatarFallback>
		</Avatar>
	);
}
