import { useCallback, useMemo, useReducer } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";

import { createInitialTuiState, reduceRuntimeEvent } from "../runtime-reducer";
import { deriveTuiViewModel } from "../view-model";

// TUI 通过这一层消费 RuntimeEvent，组件不直接理解 runtime 内部状态。
export function useRuntimeEvents({ modelName }: { modelName?: string } = {}) {
  const [state, dispatch] = useReducer(reduceRuntimeEvent, undefined, () => ({
    ...createInitialTuiState(),
    ...(modelName ? { modelName } : {}),
  }));
  const viewModel = useMemo(() => deriveTuiViewModel(state), [state]);
  const applyEvent = useCallback((event: RuntimeEvent) => dispatch(event), []);

  return { state, viewModel, applyEvent };
}
