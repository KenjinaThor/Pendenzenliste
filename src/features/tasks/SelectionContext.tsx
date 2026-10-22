import { createContext, useContext, useState, type ReactNode } from 'react';

interface SelectionApi {
  /** Pendenz, auf die sich Tastenkürzel (E, Enter) beziehen */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const SelectionContext = createContext<SelectionApi>({ selectedId: null, setSelectedId() {} });

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <SelectionContext.Provider value={{ selectedId, setSelectedId }}>
      {children}
    </SelectionContext.Provider>
  );
}

export const useSelection = () => useContext(SelectionContext);
