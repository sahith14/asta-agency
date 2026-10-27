'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, errorMessage } from './api'

/** Minimal data-fetching hook: pass null to skip (e.g. founder without a
 * selected client yet). All state updates happen inside promise callbacks
 * (never synchronously in the effect body), per react-hooks guidance. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(path))
  const [tick, setTick] = useState(0)
  const tickRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    if (!path) {
      void Promise.resolve().then(() => {
        if (cancelled) return
        setData(null)
        setError(null)
        setLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    void Promise.resolve()
      .then(async () => {
        if (cancelled) return
        setLoading(true)
        setError(null)
        try {
          const d = await apiGet<T>(path)
          if (!cancelled) {
            setData(d)
            setLoading(false)
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError(errorMessage(err))
            setLoading(false)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Something went wrong — please try again.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [path, tick])

  const refetch = useCallback(() => {
    tickRef.current += 1
    setTick(tickRef.current)
  }, [])

  return { data, error, loading, refetch }
}
