import { useCallback } from "react";
import { toast } from "sonner";

interface UseOptimisticMutationOptions<TData, TError = Error> {
	/** Function that performs the mutation */
	mutationFn: (data: TData) => Promise<void>;
	/** Function to update state optimistically */
	onOptimisticUpdate: (data: TData) => void;
	/** Function to revert state on error */
	onError?: (data: TData, error: TError) => void;
	/** Function called on successful mutation */
	onSuccess?: (data: TData) => void;
	/** Error message to show in toast */
	errorMessage?: string;
}

export function useOptimisticMutation<TData, TError = Error>({
	mutationFn,
	onOptimisticUpdate,
	onError,
	onSuccess,
	errorMessage = "An error occurred",
}: UseOptimisticMutationOptions<TData, TError>) {
	const mutate = useCallback(
		async (data: TData) => {
			onOptimisticUpdate(data);

			try {
				await mutationFn(data);

				onSuccess?.(data);
			} catch (error) {
				onError?.(data, error as TError);

				console.error("Mutation failed:", error);
				toast.error(errorMessage);
			}
		},
		[mutationFn, onOptimisticUpdate, onError, onSuccess, errorMessage],
	);

	return { mutate };
}
