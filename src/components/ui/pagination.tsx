import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
	<nav
		aria-label="pagination"
		className={cn("flex w-full justify-center", className)}
		{...props}
	/>
);

const PaginationContent = React.forwardRef<
	HTMLUListElement,
	React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
	<ul
		ref={ref}
		className={cn("flex flex-row items-center gap-2 md:gap-1", className)}
		{...props}
	/>
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
	HTMLLIElement,
	React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
	<li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = React.ComponentProps<typeof Button> & {
	isActive?: boolean;
	href?: string;
};

const PaginationLink = ({
	className,
	isActive,
	size = "sm",
	href,
	disabled,
	...props
}: PaginationLinkProps) => {
	if (href && !disabled) {
		return (
			<Link href={href}>
				<Button
					aria-current={isActive ? "page" : undefined}
					variant={isActive ? "default" : "outline"}
					size={size}
					className={cn("min-w-10", className)}
					asChild
					{...props}
				>
					<span>{props.children}</span>
				</Button>
			</Link>
		);
	}

	return (
		<Button
			aria-current={isActive ? "page" : undefined}
			variant={isActive ? "default" : "outline"}
			size={size}
			className={cn("min-w-10", className)}
			disabled={disabled}
			{...props}
		/>
	);
};
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({
	className,
	href,
	disabled,
	...props
}: PaginationLinkProps) => {
	if (href && !disabled) {
		return (
			<Link href={href}>
				<Button
					aria-label="Go to previous page"
					size="sm"
					variant="outline"
					className={cn("min-w-10", className)}
					asChild
				>
					<span>
						<ChevronLeft className="h-4 w-4" />
					</span>
				</Button>
			</Link>
		);
	}

	return (
		<Button
			aria-label="Go to previous page"
			size="sm"
			variant="outline"
			className={cn("min-w-10", className)}
			disabled={disabled}
			{...props}
		>
			<ChevronLeft className="h-4 w-4" />
		</Button>
	);
};
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({
	className,
	href,
	disabled,
	...props
}: PaginationLinkProps) => {
	if (href && !disabled) {
		return (
			<Link href={href}>
				<Button
					aria-label="Go to next page"
					size="sm"
					variant="outline"
					className={cn("min-w-10", className)}
					asChild
				>
					<span>
						<ChevronRight className="h-4 w-4" />
					</span>
				</Button>
			</Link>
		);
	}

	return (
		<Button
			aria-label="Go to next page"
			size="sm"
			variant="outline"
			className={cn("min-w-10", className)}
			disabled={disabled}
			{...props}
		>
			<ChevronRight className="h-4 w-4" />
		</Button>
	);
};
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({
	className,
	...props
}: React.ComponentProps<"span">) => (
	<span
		aria-hidden
		className={cn("flex h-9 w-9 items-center justify-center", className)}
		{...props}
	>
		<MoreHorizontal className="h-4 w-4" />
		<span className="sr-only">More pages</span>
	</span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
};
