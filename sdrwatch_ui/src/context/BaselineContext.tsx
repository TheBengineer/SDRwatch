import { createContext, useContext } from 'react'

interface BaselineContextType {
  baselineId: number | undefined
  setBaselineId: (id: number) => void
  baselines: { id: number; name: string }[]
}

export const BaselineContext = createContext<BaselineContextType>({
  baselineId: undefined,
  setBaselineId: () => {},
  baselines: [],
})

export const useBaseline = () => useContext(BaselineContext)
