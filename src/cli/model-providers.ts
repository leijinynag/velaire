import type { ModelProviderName } from "@/config/types";

export type ModelProviderConfig = {
  label: string;
  id: string;
  baseURL: string;
  providerType: ModelProviderName;
};

export const MODEL_PROVIDERS: ModelProviderConfig[] = [
  { label: "Anthropic (Claude)", id: "anthropic", baseURL: "https://api.anthropic.com", providerType: "anthropic" },
  { label: "OpenAI", id: "openai", baseURL: "https://api.openai.com/v1", providerType: "openai-compatible" },
  { label: "Volcengine - General", id: "volcengine", baseURL: "https://ark.cn-beijing.volces.com/api/v3", providerType: "openai-compatible" },
  {
    label: "Volcengine - Coding Plan",
    id: "volcengine_coding_plan",
    baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
    providerType: "openai-compatible",
  },
  { label: "Qwen (Aliyun)", id: "qwen", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", providerType: "openai-compatible" },
  { label: "Minimax (Domestic)", id: "minimax_cn", baseURL: "https://api.minimaxi.com/v1", providerType: "openai-compatible" },
  { label: "Minimax (Global)", id: "minimax_global", baseURL: "https://api.minimax.io/v1", providerType: "openai-compatible" },
  { label: "GLM (Zhipu AI)", id: "glm", baseURL: "https://open.bigmodel.cn/api/paas/v4", providerType: "openai-compatible" },
  { label: "Kimi (Moonshot)", id: "kimi", baseURL: "https://api.moonshot.cn/v1", providerType: "openai-compatible" },
  { label: "DeepSeek (OpenAI compatible)", id: "deepseek", baseURL: "https://api.deepseek.com/v1", providerType: "openai-compatible" },
  { label: "Other", id: "other", baseURL: "", providerType: "openai-compatible" },
];
