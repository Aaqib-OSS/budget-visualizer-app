import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { type Accessor, createSignal, onCleanup } from 'solid-js'
import { createCsvImport } from '@api/transactions/createCsvImport'
import { putWithProgress } from '@api/putWithProgress'
import { invalidateAfterTransactionCreate } from '@api/queryInvalidation'
import { mutationKeys } from '@api/queryKeys'
import { scheduleCsvImportFollowUpRefresh } from '@api/transactions/scheduleCsvImportFollowUpRefresh'

export type CreateCsvImportVariables = {
  file: File
  contentType: string
}

/**
 * Two-step CSV import: POST collection resource for a presigned PUT URL, then PUT to S3.
 *
 * The S3 ObjectCreated notification on transactions-bucket auto-fires the
 * transactions-bucket-to-db lambda, which parses, dedupes, and upserts. We
 * invalidate transactions broadly on success — the lambda's write usually
 * lands within a few seconds, so a delayed invalidation also fires at 30s
 * to catch the eventual rows without forcing the user to refresh. That one
 * outlives this hook; see `scheduleCsvImportFollowUpRefresh`.
 */
export function useCreateCsvImport(): {
  mutation: ReturnType<typeof useMutation<unknown, Error, CreateCsvImportVariables>>
  progress: Accessor<number>
  reset: () => void
  cancel: () => void
} {
  const queryClient = useQueryClient()
  const [progress, setProgress] = createSignal(0)
  let controller: AbortController | null = null

  const mutation = useMutation<unknown, Error, CreateCsvImportVariables>(() => ({
    mutationKey: mutationKeys.createCsvImport,
    mutationFn: async ({ file, contentType }) => {
      setProgress(0)
      controller = new AbortController()
      const { signal } = controller
      const { uploadUrl } = await createCsvImport({ filename: file.name, contentType }, { signal })
      await putWithProgress(uploadUrl, file, {
        headers: { 'Content-Type': contentType },
        signal,
        onProgress: setProgress,
      })
      return null
    },
    onSuccess: () => {
      // Covers transactions.csv (the recent-imports list) along with everything else.
      void invalidateAfterTransactionCreate(queryClient)
      scheduleCsvImportFollowUpRefresh(queryClient)
    },
    onSettled: () => {
      controller = null
    },
  }))

  const cancel = () => {
    controller?.abort()
    controller = null
    setProgress(0)
    mutation.reset()
  }

  const reset = () => {
    setProgress(0)
    mutation.reset()
  }

  onCleanup(() => {
    controller?.abort()
    controller = null
  })

  return { mutation, progress, reset, cancel }
}
