import type React from "react";
import { cn } from "@/lib/utils";

// Type definitions for component props
interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
	children: React.ReactNode;
	className?: string;
}

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
	children: React.ReactNode;
	className?: string;
}

interface TableProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	className?: string;
}

export function TypographyH1({ children, className, ...props }: HeadingProps) {
	return (
		<h1
			className={cn(
				"scroll-m-20 text-balance font-extrabold text-4xl tracking-tight",
				className,
			)}
			{...props}
		>
			{children}
		</h1>
	);
}

export function TypographyH2({ children, className, ...props }: HeadingProps) {
	return (
		<h2
			className={cn(
				"mt-10 scroll-m-20 border-b pb-2 font-semibold text-3xl tracking-tight transition-colors first:mt-0",
				className,
			)}
			{...props}
		>
			{children}
		</h2>
	);
}

export function TypographyH3({ children, className, ...props }: HeadingProps) {
	return (
		<h3
			className={cn(
				"mt-8 scroll-m-20 font-semibold text-2xl tracking-tight",
				className,
			)}
			{...props}
		>
			{children}
		</h3>
	);
}

export function TypographyH4({ children, className, ...props }: HeadingProps) {
	return (
		<h4
			className={cn(
				"scroll-m-20 font-semibold text-xl tracking-tight",
				className,
			)}
			{...props}
		>
			{children}
		</h4>
	);
}

export function TypographyP({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<p className={cn("not-first:mt-6 leading-7", className)} {...props}>
			{children}
		</p>
	);
}

export function TypographyLead({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<p className={cn("text-muted-foreground text-xl", className)} {...props}>
			{children}
		</p>
	);
}

export function TypographyLarge({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<div className={cn("font-semibold text-lg", className)} {...props}>
			{children}
		</div>
	);
}

export function TypographySmall({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<small
			className={cn("font-medium text-sm leading-none", className)}
			{...props}
		>
			{children}
		</small>
	);
}

export function TypographyMuted({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<p className={cn("text-muted-foreground text-sm", className)} {...props}>
			{children}
		</p>
	);
}

export function TypographyBlockquote({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<blockquote
			className={cn("mt-6 border-l-2 pl-6 italic", className)}
			{...props}
		>
			{children}
		</blockquote>
	);
}

export function TypographyInlineCode({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<code
			className={cn(
				"relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm",
				className,
			)}
			{...props}
		>
			{children}
		</code>
	);
}

export function TypographyList({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<ul className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)} {...props}>
			{children}
		</ul>
	);
}

export function TypographyOrderedList({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<ol
			className={cn("my-6 ml-6 list-decimal [&>li]:mt-2", className)}
			{...props}
		>
			{children}
		</ol>
	);
}

export function TypographyTable({ children, className, ...props }: TableProps) {
	return (
		<div className={cn("my-6 w-full overflow-y-auto", className)} {...props}>
			<table className="w-full">{children}</table>
		</div>
	);
}

export function TypographyTableHeader({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<thead className={className} {...props}>
			{children}
		</thead>
	);
}

export function TypographyTableBody({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<tbody className={className} {...props}>
			{children}
		</tbody>
	);
}

export function TypographyTableRow({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<tr className={cn("m-0 border-t p-0 even:bg-muted", className)} {...props}>
			{children}
		</tr>
	);
}

export function TypographyTableHead({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<th
			className={cn(
				"border px-4 py-2 text-left font-bold [[align=center]]:text-center [[align=right]]:text-right",
				className,
			)}
			{...props}
		>
			{children}
		</th>
	);
}

export function TypographyTableCell({
	children,
	className,
	...props
}: TypographyProps) {
	return (
		<td
			className={cn(
				"border px-4 py-2 text-left [[align=center]]:text-center [[align=right]]:text-right",
				className,
			)}
			{...props}
		>
			{children}
		</td>
	);
}

export function TypographyLink({
	children,
	className,
	href = "#",
	...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	return (
		<a
			href={href}
			className={cn(
				"font-medium text-primary underline underline-offset-4",
				className,
			)}
			{...props}
		>
			{children}
		</a>
	);
}

export const Typography = {
	H1: TypographyH1,
	H2: TypographyH2,
	H3: TypographyH3,
	H4: TypographyH4,
	P: TypographyP,
	Lead: TypographyLead,
	Large: TypographyLarge,
	Small: TypographySmall,
	Muted: TypographyMuted,
	Blockquote: TypographyBlockquote,
	InlineCode: TypographyInlineCode,
	List: TypographyList,
	OrderedList: TypographyOrderedList,
	Table: TypographyTable,
	TableHeader: TypographyTableHeader,
	TableBody: TypographyTableBody,
	TableRow: TypographyTableRow,
	TableHead: TypographyTableHead,
	TableCell: TypographyTableCell,
	Link: TypographyLink,
};
