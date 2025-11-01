import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";

interface PaginationMetadata {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

interface GenericPaginatorProps {
	pagination: PaginationMetadata;
	baseUrl: string;
	maxVisiblePages?: number;
}

function renderPaginationItems(
	currentPage: number,
	totalPages: number,
	baseUrl: string,
	maxVisible: number = 5,
) {
	const items: React.ReactNode[] = [];

	// prev
	items.push(
		<PaginationItem key="previous">
			<PaginationPrevious
				href={
					currentPage > 1 ? `${baseUrl}?page=${currentPage - 1}` : undefined
				}
				disabled={currentPage === 1}
			/>
		</PaginationItem>,
	);

	if (totalPages <= maxVisible) {
		for (let i = 1; i <= totalPages; i++) {
			items.push(
				<PaginationItem key={i}>
					<PaginationLink
						href={`${baseUrl}?page=${i}`}
						isActive={i === currentPage}
					>
						{i}
					</PaginationLink>
				</PaginationItem>,
			);
		}
	} else {
		// first
		items.push(
			<PaginationItem key={1}>
				<PaginationLink href={`${baseUrl}?page=1`} isActive={currentPage === 1}>
					1
				</PaginationLink>
			</PaginationItem>,
		);

		// ...
		if (currentPage > 3) {
			items.push(
				<PaginationItem key="ellipsis-start">
					<PaginationEllipsis />
				</PaginationItem>,
			);
		}

		// current + neigh
		const start = Math.max(2, currentPage - 1);
		const end = Math.min(totalPages - 1, currentPage + 1);

		for (let i = start; i <= end; i++) {
			items.push(
				<PaginationItem key={i}>
					<PaginationLink
						href={`${baseUrl}?page=${i}`}
						isActive={i === currentPage}
					>
						{i}
					</PaginationLink>
				</PaginationItem>,
			);
		}

		// ...
		if (currentPage < totalPages - 2) {
			items.push(
				<PaginationItem key="ellipsis-end">
					<PaginationEllipsis />
				</PaginationItem>,
			);
		}

		// last
		items.push(
			<PaginationItem key={totalPages}>
				<PaginationLink
					href={`${baseUrl}?page=${totalPages}`}
					isActive={currentPage === totalPages}
				>
					{totalPages}
				</PaginationLink>
			</PaginationItem>,
		);
	}

	// next
	items.push(
		<PaginationItem key="next">
			<PaginationNext
				href={
					currentPage < totalPages
						? `${baseUrl}?page=${currentPage + 1}`
						: undefined
				}
				disabled={currentPage === totalPages}
			/>
		</PaginationItem>,
	);

	return items;
}

export function Paginator({
	pagination,
	baseUrl,
	maxVisiblePages = 5,
}: GenericPaginatorProps) {
	if (pagination.totalPages <= 1) {
		return null;
	}

	return (
		<Pagination>
			<PaginationContent>
				{renderPaginationItems(
					pagination.page,
					pagination.totalPages,
					baseUrl,
					maxVisiblePages,
				)}
			</PaginationContent>
		</Pagination>
	);
}
