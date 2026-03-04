/**
 * detail.js — 细节捕捉器
 *
 * 让宠物注意到用户"以为没人注意的事"
 * · 细节回响：记住随口说的话，过几天主动提起
 * · 情绪镜像：宠物动画/语气随用户情绪波动
 * · 成长见证：感知用户变化，用对比感制造时间流逝感
 */

export class DetailCatcher {
  constructor(memorySystem) {
    this.memory = memorySystem;
    // 待回响的细节队列（存入 DB 之前的缓冲）
    this._pendingDetails = [];
  }

  /**
   * 从用户消息中捕捉值得记住的细节
   * 返回捕捉到的内容列表
   */
  catch(userMessage) {
    const caught = [];

    // 情绪信号
    const emotionPatterns = [
      { re: /睡不着|失眠|睡不好/, tag: '睡眠问题', weight: 3.5 },
      { re: /压力|累|好累|太累/, tag: '压力状态', weight: 3.0 },
      { re: /开心|好开心|高兴|哈哈/, tag: '开心时刻', weight: 2.5 },
      { re: /难过|伤心|哭/, tag: '难过时刻', weight: 4.0 },
      { re: /焦虑|紧张|害怕/, tag: '焦虑状态', weight: 3.5 },
    ];

    // 生活事件
    const eventPatterns = [
      { re: /面试|offer|工作/, tag: '工作事件', weight: 4.0 },
      { re: /考试|成绩|分数/, tag: '考试事件', weight: 3.5 },
      { re: /喜欢.{1,10}|暗恋|表白|恋爱/, tag: '感情事件', weight: 4.5 },
      { re: /家人|爸|妈|父母|爷|奶/, tag: '家人话题', weight: 3.5 },
      { re: /朋友.{0,5}说|朋友.{0,5}做/, tag: '朋友话题', weight: 2.5 },
      { re: /生日|过生日/, tag: '生日', weight: 5.0 },
      { re: /买了|入手|买到/, tag: '购物事件', weight: 2.0 },
      { re: /去了|今天去|昨天去/, tag: '外出事件', weight: 2.0 },
    ];

    // 偏好信息
    const preferencePatterns = [
      { re: /喜欢吃|最爱吃|爱吃/, tag: '食物偏好', weight: 2.5, category: 'preference', key: '喜欢的食物' },
      { re: /讨厌|不喜欢|受不了/, tag: '厌恶偏好', weight: 2.5 },
      { re: /爱看|喜欢看|在看/, tag: '娱乐偏好', weight: 2.0, category: 'preference', key: '喜欢看的内容' },
    ];

    const allPatterns = [...emotionPatterns, ...eventPatterns, ...preferencePatterns];

    for (const pattern of allPatterns) {
      const match = userMessage.match(pattern.re);
      if (match) {
        const detail = {
          content: `用户说：「${userMessage.slice(0, 80)}」（${pattern.tag}）`,
          weight: pattern.weight,
          tag: pattern.tag,
          raw: userMessage,
          ts: Date.now(),
        };
        caught.push(detail);

        // 高权重的直接存入情节记忆
        if (pattern.weight >= 3.0) {
          this.memory.addEpisode(
            detail.content,
            pattern.weight,
            [pattern.tag]
          );
        }

        // 偏好信息更新用户模型
        if (pattern.category) {
          this.memory.updateUserModel(
            pattern.category,
            pattern.key || pattern.tag,
            userMessage.slice(0, 100),
            0.8
          );
        }
      }
    }

    return caught;
  }

  /**
   * 判断是否应该主动"回响"某个过去的细节
   * 返回一个可以插入对话的提醒片段，或 null
   */
  getEchoHint(currentInput) {
    // 查找 3天前 - 14天前 的情节（时间刚好，不太远不太近）
    const now = Math.floor(Date.now() / 1000);
    const threeDaysAgo = now - 3 * 86400;
    const fourteenDaysAgo = now - 14 * 86400;

    const db = this.memory.db;
    const oldEpisodes = db.prepare(`
      SELECT * FROM episodes
      WHERE user_id = ?
        AND created_at BETWEEN ? AND ?
        AND recalled_count < 2
      ORDER BY emotion_weight DESC
      LIMIT 3
    `).all(this.memory.userId, fourteenDaysAgo, threeDaysAgo);

    if (oldEpisodes.length === 0) return null;

    // 随机选一个（30% 概率触发，避免每次都回响）
    if (Math.random() > 0.30) return null;

    const ep = oldEpisodes[Math.floor(Math.random() * oldEpisodes.length)];
    return ep.content;
  }

  /**
   * 构建细节提示，注入 Prompt
   */
  buildDetailPrompt(currentInput) {
    const echo = this.getEchoHint(currentInput);
    if (!echo) return '';

    return `
【细节回响提示】
你记得之前发生过这件事：${echo}
如果自然的话，可以在回复中关心一下后续——但要表现得像随口想起来的，不要太刻意。
`.trim();
  }

  /**
   * 构建成长见证提示（关系较深时使用）
   */
  buildGrowthWitnessPrompt(stage, totalSessions) {
    if (stage === 'stranger' || totalSessions < 10) return '';

    return `
【成长见证】
你和他已经聊过 ${totalSessions} 次了。你感觉他比刚认识的时候变了——可以在合适时机用一句话说出来，比如"你现在比之前好多了""你以前不会这样说的"。
`.trim();
  }
}
