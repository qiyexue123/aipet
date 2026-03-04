/**
 * memory.js — 分层记忆系统
 *
 * Layer 3: 核心人物模型  (长期永久)  用户基本画像、重要关系、深层偏好
 * Layer 2: 情节记忆      (中期滚动)  发生过的重要事件，带情感权重
 * Layer 1: 对话上下文    (短期会话)  当前对话内容
 *
 * 每次对话结束后，自动抽取信息更新 Layer2/3
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/memory.db');

export class MemorySystem {
  constructor(userId = 'default') {
    this.userId = userId;
    this.db = new Database(DB_PATH);
    this._initDB();
    // 短期上下文（内存）
    this.sessionContext = [];
    this.maxContextLength = 20;
  }

  _initDB() {
    this.db.exec(`
      -- Layer 3: 核心人物模型
      CREATE TABLE IF NOT EXISTS user_model (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,   -- 'identity' | 'relationship' | 'preference' | 'emotion_pattern'
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        UNIQUE(user_id, category, key)
      );

      -- Layer 2: 情节记忆
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,          -- 事件描述
        emotion_weight REAL DEFAULT 1.0, -- 情感权重 1-5，越高越难忘
        recalled_count INTEGER DEFAULT 0,
        last_recalled INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        tags TEXT DEFAULT ''            -- JSON array of tags
      );

      -- 关系状态
      CREATE TABLE IF NOT EXISTS relationship (
        user_id TEXT PRIMARY KEY,
        stage TEXT DEFAULT 'stranger',  -- stranger | familiar | close | soulmate
        intimacy INTEGER DEFAULT 0,     -- 亲密度积分
        total_sessions INTEGER DEFAULT 0,
        last_seen INTEGER,
        first_seen INTEGER DEFAULT (strftime('%s','now')),
        shared_jokes TEXT DEFAULT '[]', -- 只属于你们的梗
        pet_nickname TEXT DEFAULT NULL  -- 宠物给用户的专属昵称
      );
    `);

    // 初始化关系记录
    this.db.prepare(`
      INSERT OR IGNORE INTO relationship (user_id) VALUES (?)
    `).run(this.userId);
  }

  // ─── Layer 1: 会话上下文 ───────────────────────────────────

  addToContext(role, content) {
    this.sessionContext.push({ role, content, ts: Date.now() });
    // 保持最近 N 条
    if (this.sessionContext.length > this.maxContextLength) {
      this.sessionContext = this.sessionContext.slice(-this.maxContextLength);
    }
  }

  getContext() {
    return this.sessionContext.map(({ role, content }) => ({ role, content }));
  }

  clearContext() {
    this.sessionContext = [];
  }

  // ─── Layer 2: 情节记忆 ────────────────────────────────────

  addEpisode(content, emotionWeight = 1.0, tags = []) {
    this.db.prepare(`
      INSERT INTO episodes (user_id, content, emotion_weight, tags)
      VALUES (?, ?, ?, ?)
    `).run(this.userId, content, emotionWeight, JSON.stringify(tags));
  }

  /**
   * 检索相关情节记忆（简单关键词匹配，生产环境替换为向量检索）
   */
  recallEpisodes(query = '', limit = 5) {
    const episodes = this.db.prepare(`
      SELECT * FROM episodes
      WHERE user_id = ?
      ORDER BY emotion_weight DESC, created_at DESC
      LIMIT 30
    `).all(this.userId);

    if (!query) return episodes.slice(0, limit);

    // 简单关键词匹配打分
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = episodes.map(ep => {
      const text = ep.content.toLowerCase();
      const score = keywords.filter(k => text.includes(k)).length * ep.emotion_weight;
      return { ...ep, score };
    }).filter(ep => ep.score > 0)
      .sort((a, b) => b.score - a.score);

    // 更新召回次数
    const ids = scored.slice(0, limit).map(ep => ep.id);
    if (ids.length) {
      this.db.prepare(`
        UPDATE episodes SET recalled_count = recalled_count + 1,
        last_recalled = strftime('%s','now')
        WHERE id IN (${ids.join(',')})
      `).run();
    }

    return scored.slice(0, limit);
  }

  // ─── Layer 3: 核心人物模型 ────────────────────────────────

  updateUserModel(category, key, value, confidence = 1.0) {
    this.db.prepare(`
      INSERT INTO user_model (user_id, category, key, value, confidence, updated_at)
      VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
      ON CONFLICT(user_id, category, key) DO UPDATE SET
        value = excluded.value,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
    `).run(this.userId, category, key, value, confidence);
  }

  getUserModel() {
    const rows = this.db.prepare(`
      SELECT category, key, value, confidence FROM user_model
      WHERE user_id = ? ORDER BY confidence DESC
    `).all(this.userId);

    const model = {};
    for (const row of rows) {
      if (!model[row.category]) model[row.category] = {};
      model[row.category][row.key] = { value: row.value, confidence: row.confidence };
    }
    return model;
  }

  // ─── 关系系统 ────────────────────────────────────────────

  getRelationship() {
    return this.db.prepare(
      'SELECT * FROM relationship WHERE user_id = ?'
    ).get(this.userId);
  }

  updateRelationship(updates) {
    const rel = this.getRelationship();
    const newIntimacy = (rel.intimacy || 0) + (updates.intimacyDelta || 0);

    // 关系阶段自动晋级
    let stage = rel.stage;
    if (newIntimacy >= 500) stage = 'soulmate';
    else if (newIntimacy >= 150) stage = 'close';
    else if (newIntimacy >= 30) stage = 'familiar';
    else stage = 'stranger';

    this.db.prepare(`
      UPDATE relationship SET
        stage = ?,
        intimacy = ?,
        total_sessions = total_sessions + ?,
        last_seen = strftime('%s','now'),
        pet_nickname = COALESCE(?, pet_nickname),
        shared_jokes = COALESCE(?, shared_jokes)
      WHERE user_id = ?
    `).run(
      stage,
      newIntimacy,
      updates.newSession ? 1 : 0,
      updates.petNickname || null,
      updates.sharedJokes ? JSON.stringify(updates.sharedJokes) : null,
      this.userId
    );

    return this.getRelationship();
  }

  /**
   * 获取上次见面距今多少天
   */
  getDaysSinceLastSeen() {
    const rel = this.getRelationship();
    if (!rel.last_seen) return null;
    return Math.floor((Date.now() / 1000 - rel.last_seen) / 86400);
  }

  /**
   * 格式化记忆摘要，注入 Prompt
   */
  buildMemorySummary(currentInput = '') {
    const model = this.getUserModel();
    const rel = this.getRelationship();
    const episodes = this.recallEpisodes(currentInput, 4);
    const daysSince = this.getDaysSinceLastSeen();

    const parts = [];

    // 用户画像
    if (Object.keys(model).length > 0) {
      parts.push('【关于用户】');
      for (const [cat, items] of Object.entries(model)) {
        for (const [key, { value }] of Object.entries(items)) {
          parts.push(`· ${key}：${value}`);
        }
      }
    }

    // 关系状态
    parts.push(`\n【你们的关系】阶段：${rel.stage}，亲密度：${rel.intimacy}`);
    if (rel.pet_nickname) parts.push(`· 你叫他"${rel.pet_nickname}"`);
    if (daysSince !== null && daysSince > 0) {
      parts.push(`· 他已经 ${daysSince} 天没来了`);
    }
    const jokes = JSON.parse(rel.shared_jokes || '[]');
    if (jokes.length > 0) {
      parts.push(`· 你们之间的梗：${jokes.join('、')}`);
    }

    // 相关情节
    if (episodes.length > 0) {
      parts.push('\n【你记得的事】');
      for (const ep of episodes) {
        parts.push(`· ${ep.content}`);
      }
    }

    return parts.join('\n');
  }
}
