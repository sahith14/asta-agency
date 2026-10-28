'use client'

/**
 * Project configurator state — a lightweight zustand store so any button on
 * the public site can open the configurator, and so the 7-step flow keeps
 * its answers while visitors navigate between steps.
 */
import { create } from 'zustand'

export interface ConfiguratorAnswers {
  serviceId: string | null
  alsoInterested: string[]
  goal: string | null
  scopePages: string | null
  scopeFeatures: string[]
  scopeDeliverables: string | null
  scopeLocations: string | null
  scopePlatforms: string[]
  budget: string | null
  timing: string | null
  description: string
  url: string
  name: string
  email: string
  phone: string
  contactMethod: 'EMAIL' | 'PHONE' | 'NO_PREFERENCE'
  consent: boolean
}

export const emptyAnswers: ConfiguratorAnswers = {
  serviceId: null,
  alsoInterested: [],
  goal: null,
  scopePages: null,
  scopeFeatures: [],
  scopeDeliverables: null,
  scopeLocations: null,
  scopePlatforms: [],
  budget: null,
  timing: null,
  description: '',
  url: '',
  name: '',
  email: '',
  phone: '',
  contactMethod: 'NO_PREFERENCE',
  consent: false,
}

interface ConfiguratorState {
  open: boolean
  step: number // 1..7
  openedAt: number
  answers: ConfiguratorAnswers
  openConfigurator: (presetServiceId?: string) => void
  closeConfigurator: () => void
  setStep: (step: number) => void
  patch: (partial: Partial<ConfiguratorAnswers>) => void
  reset: () => void
}

export const useConfigurator = create<ConfiguratorState>(set => ({
  open: false,
  step: 1,
  openedAt: 0,
  answers: { ...emptyAnswers },
  openConfigurator: presetServiceId =>
    set(s => ({
      open: true,
      step: 1,
      openedAt: Date.now(),
      answers: { ...emptyAnswers, ...(presetServiceId ? { serviceId: presetServiceId } : {}) },
    })),
  closeConfigurator: () => set({ open: false }),
  setStep: step => set({ step }),
  patch: partial => set(s => ({ answers: { ...s.answers, ...partial } })),
  reset: () => set({ answers: { ...emptyAnswers }, step: 1, openedAt: Date.now() }),
}))
