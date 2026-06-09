import { useCallback, useMemo, useReducer } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";

import { createInitialTuiState, reduceRuntimeEvent } from "../runtime-reducer";
import { deriveTuiViewModel } from "../view-model";

export function useRuntimeEvents({ modelName }: { modelName?: string } = {}) {
  const [state, dispatch] = useReducer(reduceRuntimeEvent, undefined, () => ({
    ...createInitialTuiState(),
    ...(modelName ? { modelName } : {}),
  }));
  const viewModel = useMemo(() => deriveTuiViewModel(state), [state]);
  const applyEvent = useCallback((event: RuntimeEvent) => dispatch(event), []);

  return { state, viewModel, applyEvent };
}
