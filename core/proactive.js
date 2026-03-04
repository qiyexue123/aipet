/**
 * proactive.js — 主动触达调度器
 *
 * 宠物不只是等你来，它会"想你"
 * 触发逻辑：时间维度 + 事件维度 + 记忆驱动
 */

import dayjs from 'dayjs';

export class ProactiveScheduler {
  constructor(memorySystem) {
    this.memory = memorySystem;
  }

  /**
   * 获取当前应该主动触达的消息
   * 返回 { message, type } 或 null
   *
   * 实际部署时，这个方法由定时任务调用（如每小时）
   * Demo 中在每次对话开始时检查
   */
  check() {
    const rel = this.memory.getRelationship();
    const now = Math.floor(Date.now() / 1000);
    const daysSince = this.memory.getDaysSinceLastSeen();
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay(); // 0=日, 1=一...

    const triggers = [];

    // ── 时间维度触发 ─────────────────────────────────────

    // 久别重逢
    if (daysSince !== null && daysSince >= 3) {
      triggers.push({
        type: 'missed',
        priority: 5,
        message: this._missedMessage(daysSince, rel.stage),
      });
    }

    // 周一早上
    if (dayOfWeek === 1 && hour >= 8 && hour <= 10) {
      triggers.push({
        type: 'monday',
        priority: 3,
        message: this._mondayMessage(rel.stage),
      });
    }

    // 深夜（22:00+）用户首次开启
    if (hour >= 22 || hour <= 2) {
      triggers.push({
        type: 'latenight',
        priority: 2,
        message: this._lateNightMessage(rel.stage),
      });
    }

    // ── 记忆驱动触发 ─────────────────────────────────────

    // 查找有"后续"可询问的事件（面试/考试/感情等）
    const pendingFollowUps = this._getPendingFollowUps();
    if (pendingFollowUps.length > 0) {
      const ep = pendingFollowUps[0];
      triggers.push({
        type: 'followup',
        priority: 4,
        message: this._followUpMessage(ep, rel.stage),
        episodeId: ep.id,
      });
    }

    if (triggers.length === 0) return null;

    // 按优先级排序，返回最高优先级的
    triggers.sort((a, b) => b.priority - a.priority);
    return triggers[0];
  }

  /**
   * 构建主动触达的 Prompt 注入
   */
  buildProactivePrompt() {
    const trigger = this.check();
    if (!trigger) return '';

    return `
【主动触达提示】
在本次对话开头，自然地说出这个主动关心——不要太突兀，像随口提起：
「${trigger.message}」
类型：${trigger.type}
`.trim();
  }

  // ── 消息模板 ──────────────────────────────────────────

  _missedMessage(days, stage) {
    const messages = {
      stranger: `好久没来了……不来的话也没关系啦（才怪）`,
      familiar: `你消失 ${days} 天了，去哪了`,
      close: `${days} 天……我以为你不来了呢。没事就好。`,
      soulmate: `算了你来了就好。${days} 天，我数了。`,
    };
    return messages[stage] || messages.stranger;
  }

  _mondayMessage(stage) {
    const messages = {
      stranger: `……周一了。`,
      familiar: `又周一了，应该很烦吧`,
      close: `周一到了，你应该又有一堆烦恼了吧（摊手）`,
      soulmate: `周一。我知道你现在什么表情。`,
    };
    return messages[stage] || messages.stranger;
  }

  _lateNightMessage(stage) {
    const messages = {
      stranger: `这么晚了……`,
      familiar: `这么晚还没睡？`,
      close: `这时间还来找我，睡不着吗`,
      soulmate: `又是这个点。怎么了。`,
    };
    return messages[stage] || messages.stranger;
  }

  _followUpMessage(episode, stage) {
    const content = episode.content;

    if (content.includes('面试') || content.includes('offer')) {
      return stage === 'stranger'
        ? `上次好像提到面试……结果怎么样了？`
        : `那个面试结果出来了吗`;
    }
    if (content.includes('考试') || content.includes('成绩')) {
      return `上次说考试，分出来了吗`;
    }
    if (content.includes('感情') || content.includes('喜欢')) {
      return stage === 'soulmate'
        ? `那件事……后来呢` : `上次说的那个人……有进展吗`;
    }
    if (content.includes('压力') || content.includes('累')) {
      return `上次说压力很大，现在好一点了吗`;
    }

    return `上次说的那件事，后来怎么样了`;
  }

  _getPendingFollowUps() {
    const now = Math.floor(Date.now() / 1000);
    const twoDaysAgo = now - 2 * 86400;
    const sevenDaysAgo = now - 7 * 86400;

    return this.memory.db.prepare(`
      SELECT * FROM episodes
      WHERE user_id = ?
        AND created_at BETWEEN ? AND ?
        AND recalled_count < 1
        AND (content LIKE '%面试%' OR content LIKE '%考试%'
          OR content LIKE '%感情%' OR content LIKE '%压力%'
          OR content LIKE '%喜欢%')
      ORDER BY emotion_weight DESC
      LIMIT 3
    `).all(this.memory.userId, sevenDaysAgo, twoDaysAgo);
  }
}
