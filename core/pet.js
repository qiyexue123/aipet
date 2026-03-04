/**
 * pet.js — 主引擎
 *
 * 组合四个维度：记忆 × 人格 × 主动 × 细节
 * 对外暴露简洁的 chat() 接口
 */

import OpenAI from 'openai';
import { MemorySystem } from './memory.js';
import { PersonaEngine } from './persona.js';
import { ProactiveScheduler } from './proactive.js';
import { DetailCatcher } from './detail.js';
import { buildSystemPrompt } from '../prompts/system.js';
import { LongLongPersona } from '../prompts/personas/longlong.js';

export class AIPet {
  constructor({ userId = 'default', persona = LongLongPersona, apiConfig = {} } = {}) {
    this.userId = userId;
    this.persona = persona;

    // 四个核心模块
    this.memory = new MemorySystem(userId);
    this.personaEngine = new PersonaEngine(persona);
    this.proactive = new ProactiveScheduler(this.memory);
    this.detail = new DetailCatcher(this.memory);

    // LLM 客户端（支持 OpenAI 兼容接口）
    this.llm = new OpenAI({
      apiKey: apiConfig.apiKey || process.env.OPENAI_API_KEY || 'sk-xxx',
      baseURL: apiConfig.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
    this.model = apiConfig.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // 当前会话标记
    this._sessionStarted = false;
  }

  /**
   * 主对话接口
   * @param {string} userMessage
   * @returns {Promise<{reply: string, mood: object, caughtDetails: array}>}
   */
  async chat(userMessage) {
    // ── 1. 捕捉细节 ───────────────────────────────────────
    const caughtDetails = this.detail.catch(userMessage);

    // ── 2. 更新情绪状态 ────────────────────────────────────
    const sentiment = this.personaEngine.detectSentiment(userMessage);
    this.personaEngine.updateMood(userMessage, sentiment);

    // ── 3. 获取关系状态 ────────────────────────────────────
    const rel = this.memory.getRelationship();

    // ── 4. 构建 System Prompt（四维合一）──────────────────
    const systemPrompt = buildSystemPrompt({
      personaPrompt: this.personaEngine.buildPersonaPrompt(rel.stage),
      memorySummary: this.memory.buildMemorySummary(userMessage),
      proactivePrompt: !this._sessionStarted
        ? this.proactive.buildProactivePrompt()
        : '',
      detailPrompt: this.detail.buildDetailPrompt(userMessage),
      growthWitnessPrompt: this.detail.buildGrowthWitnessPrompt(
        rel.stage, rel.total_sessions
      ),
    });

    this._sessionStarted = true;

    // ── 5. 检查触发词（直接响应，不走 LLM）─────────────────
    for (const [trigger, response] of Object.entries(this.persona.triggers || {})) {
      if (userMessage.includes(trigger)) {
        this.memory.addToContext('user', userMessage);
        this.memory.addToContext('assistant', response);
        this._postProcess(userMessage, response);
        return { reply: response, mood: this.personaEngine.moodState, caughtDetails };
      }
    }

    // ── 6. 调用 LLM ────────────────────────────────────────
    this.memory.addToContext('user', userMessage);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.memory.getContext(),
    ];

    let reply = '';
    try {
      const response = await this.llm.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.85,   // 稍高，让回复更有个性
        max_tokens: 200,     // 宠物说话要短
        presence_penalty: 0.3,
        frequency_penalty: 0.3,
      });
      reply = response.choices[0].message.content.trim();
    } catch (err) {
      reply = `（龙龙发呆中……${err.message}）`;
    }

    // ── 7. 后处理：更新记忆、关系 ─────────────────────────
    this.memory.addToContext('assistant', reply);
    this._postProcess(userMessage, reply);

    return { reply, mood: this.personaEngine.moodState, caughtDetails };
  }

  /**
   * 对话后处理：异步提取记忆、更新关系
   * 生产环境这里可以做更复杂的记忆提炼（用 LLM 二次提取）
   */
  _postProcess(userMessage, reply) {
    // 亲密度：每次对话 +1，有情感内容 +2
    const emotional = this.personaEngine.detectSentiment(userMessage) !== 0;
    this.memory.updateRelationship({
      intimacyDelta: emotional ? 3 : 1,
      newSession: !this._sessionCounted,
    });
    this._sessionCounted = true;
  }

  /**
   * 结束会话（更新 last_seen 等）
   */
  endSession() {
    this.memory.clearContext();
    this._sessionStarted = false;
    this._sessionCounted = false;
  }

  /**
   * 获取宠物状态（用于 UI 显示）
   */
  getStatus() {
    const rel = this.memory.getRelationship();
    const mood = this.personaEngine.moodState;
    return {
      petName: this.persona.name,
      petEmoji: this.persona.emoji,
      stage: rel.stage,
      intimacy: rel.intimacy,
      daysSince: this.memory.getDaysSinceLastSeen(),
      mood: this.personaEngine.describeMood(),
      moodState: mood,
    };
  }
}
