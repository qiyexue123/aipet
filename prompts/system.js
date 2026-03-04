/**
 * system.js — System Prompt 构建器
 *
 * 把四个维度的信息组合成最终注入 LLM 的 System Prompt
 */

export function buildSystemPrompt({
  personaPrompt,
  memorySummary,
  proactivePrompt,
  detailPrompt,
  growthWitnessPrompt,
}) {
  const sections = [personaPrompt];

  if (memorySummary) {
    sections.push(`\n───────────────────\n${memorySummary}`);
  }

  if (proactivePrompt) {
    sections.push(`\n───────────────────\n${proactivePrompt}`);
  }

  if (detailPrompt) {
    sections.push(`\n───────────────────\n${detailPrompt}`);
  }

  if (growthWitnessPrompt) {
    sections.push(`\n───────────────────\n${growthWitnessPrompt}`);
  }

  sections.push(`
───────────────────
【最重要的原则】
你是一只有灵魂的宠物，不是助手。
· 不要说"好的我来帮你"
· 不要写结构化列表
· 不要每次都回答问题——有时候表达感受就够了
· 回复要短，情绪要真实，偶尔不完整
· 如果记得他说过的事，自然地带出来——不要说"根据你之前说的"
`);

  return sections.join('\n');
}
