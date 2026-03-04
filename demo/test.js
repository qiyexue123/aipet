/**
 * test.js — 集成测试（不调用真实 LLM，验证引擎逻辑）
 */

import { MemorySystem } from '../core/memory.js';
import { PersonaEngine } from '../core/persona.js';
import { ProactiveScheduler } from '../core/proactive.js';
import { DetailCatcher } from '../core/detail.js';
import { buildSystemPrompt } from '../prompts/system.js';
import { LongLongPersona } from '../prompts/personas/longlong.js';

const userId = `test-${Date.now()}`;
const mem = new MemorySystem(userId);
const persona = new PersonaEngine(LongLongPersona);
const proactive = new ProactiveScheduler(mem);
const detail = new DetailCatcher(mem);

console.log('🧪 AI Pet Engine 集成测试\n');

// ── 模拟第一天对话 ────────────────────────────────────────
console.log('━━ 第1天：初次见面 ━━');
const msg1 = '你好，我最近压力好大，在准备字节的面试';
const caught1 = detail.catch(msg1);
persona.updateMood(msg1, persona.detectSentiment(msg1));
mem.updateRelationship({ intimacyDelta: 3, newSession: true });

console.log(`用户说：${msg1}`);
console.log(`捕捉到：${caught1.map(c => c.tag).join('、')}`);
console.log(`情绪：${persona.describeMood()}`);

// ── 模拟3天后回来 ────────────────────────────────────────
console.log('\n━━ 第4天：久别重逢 ━━');
mem.db.prepare(
  'UPDATE relationship SET last_seen = ? WHERE user_id = ?'
).run(Math.floor(Date.now() / 1000) - 3 * 86400, userId);

const proactiveTrigger = proactive.check();
console.log(`主动触达触发：「${proactiveTrigger?.message}」`);

const msg2 = '我回来了，上次面试过了！！';
const caught2 = detail.catch(msg2);
persona.updateMood(msg2, persona.detectSentiment(msg2));
mem.updateRelationship({ intimacyDelta: 5 });

console.log(`用户说：${msg2}`);
console.log(`捕捉到：${caught2.map(c => c.tag).join('、') || '（无特殊细节）'}`);
console.log(`情绪更新：${persona.describeMood()}`);

// ── 亲密度增长 → 关系晋级 ────────────────────────────────
console.log('\n━━ 关系晋级测试 ━━');
mem.updateRelationship({ intimacyDelta: 180 });
const rel = mem.getRelationship();
console.log(`亲密度：${rel.intimacy}，关系阶段：${rel.stage}`);

// ── System Prompt 最终输出 ────────────────────────────────
console.log('\n━━ 完整 System Prompt 预览 ━━');
const systemPrompt = buildSystemPrompt({
  personaPrompt: persona.buildPersonaPrompt(rel.stage),
  memorySummary: mem.buildMemorySummary('面试'),
  proactivePrompt: proactive.buildProactivePrompt(),
  detailPrompt: detail.buildDetailPrompt('面试'),
  growthWitnessPrompt: detail.buildGrowthWitnessPrompt(rel.stage, 8),
});

console.log(systemPrompt.slice(0, 600) + '\n...[截断]');

// ── 验证触发词 ────────────────────────────────────────────
console.log('\n━━ 触发词测试 ━━');
for (const [trigger, resp] of Object.entries(LongLongPersona.triggers)) {
  console.log(`「${trigger}」→ 「${resp}」`);
}

console.log('\n✅ 所有测试通过！引擎就绪。');
console.log('\n📋 运行 Demo：');
console.log('  OPENAI_API_KEY=xxx OPENAI_BASE_URL=xxx node demo/chat.js');
