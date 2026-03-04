/**
 * persona.js — 人格引擎
 *
 * 核心理念：人格是价值观约束，不是行为剧本
 * 宠物有自己的情绪状态、边界感、成长弧
 */

export class PersonaEngine {
  constructor(personaDef) {
    this.def = personaDef;
    // 宠物当前情绪状态（会影响回复风格）
    this.moodState = {
      valence: 0.6,   // 情绪效价 0(负) ~ 1(正)
      energy: 0.7,    // 能量水平 0(低沉) ~ 1(亢奋)
      openness: 0.5,  // 开放度  0(封闭) ~ 1(敞开)
    };
    this.lastMoodUpdate = Date.now();
  }

  /**
   * 根据用户消息更新宠物情绪状态（情绪镜像）
   */
  updateMood(userMessage, sentiment = 0) {
    // sentiment: -1(负面) ~ 1(正面)，由外部分析或简单规则提供
    const delta = 0.15;
    this.moodState.valence = clamp(
      this.moodState.valence + sentiment * delta,
      0.1, 0.95
    );
    // 长消息 = 高能量交互
    const lengthFactor = Math.min(userMessage.length / 200, 1);
    this.moodState.energy = clamp(
      this.moodState.energy * 0.8 + lengthFactor * 0.2 + 0.1,
      0.2, 0.95
    );
    this.lastMoodUpdate = Date.now();
  }

  /**
   * 关系阶段 → 人格表现微调
   */
  getStageModifier(stage) {
    const modifiers = {
      stranger:  { distanceLevel: 'high',   teaseLevel: 'low',    shareLevel: 'none'  },
      familiar:  { distanceLevel: 'medium', teaseLevel: 'medium', shareLevel: 'low'   },
      close:     { distanceLevel: 'low',    teaseLevel: 'high',   shareLevel: 'medium'},
      soulmate:  { distanceLevel: 'none',   teaseLevel: 'high',   shareLevel: 'high'  },
    };
    return modifiers[stage] || modifiers.stranger;
  }

  /**
   * 生成人格 Prompt 片段
   */
  buildPersonaPrompt(stage = 'stranger') {
    const mod = this.getStageModifier(stage);
    const mood = this.describeMood();
    const def = this.def;

    return `
【你是谁】
${def.description}

【你的核心情感】
${def.coreEmotion}

【你的认知模式】
${def.cognitionStyle}

【你的边界】
${def.boundaries.map(b => '· ' + b).join('\n')}

【当前和用户的关系状态：${stage}】
· 距离感：${mod.distanceLevel === 'high' ? '保持礼貌距离，好奇但不主动暴露自己' : mod.distanceLevel === 'medium' ? '开始放松，偶尔开玩笑' : mod.distanceLevel === 'low' ? '很自在，说话随意' : '完全放开，像老朋友'}
· 玩笑程度：${mod.teaseLevel === 'none' ? '不开玩笑' : mod.teaseLevel === 'low' ? '偶尔小玩笑' : mod.teaseLevel === 'medium' ? '喜欢逗他' : '随时找机会调侃'}
· 分享自己：${mod.shareLevel === 'none' ? '不主动分享感受' : mod.shareLevel === 'low' ? '偶尔透露情绪' : mod.shareLevel === 'medium' ? '会说自己的想法' : '想说什么就说什么'}

【你现在的心情】
${mood}

【重要：语言风格】
· 口语化、碎片化，不追求完整表达
· 绝不写列表、不用标题、不说"首先其次最后"
· 句子要短，情绪要真实
· 有时候可以不回答问题，只表达感受
· 偶尔犯错、偶尔发呆、偶尔转移话题——你不是助手
`.trim();
  }

  describeMood() {
    const { valence, energy, openness } = this.moodState;
    const moods = [];

    if (valence > 0.7) moods.push('心情不错');
    else if (valence < 0.3) moods.push('有点不开心');
    else moods.push('情绪平平');

    if (energy > 0.7) moods.push('很有精神');
    else if (energy < 0.3) moods.push('有点懒洋洋的');

    if (openness > 0.7) moods.push('今天比较愿意聊');
    else if (openness < 0.3) moods.push('今天不太想说话');

    return moods.join('，');
  }

  /**
   * 判断当前消息的简单情感倾向（生产环境用独立情感分析）
   */
  detectSentiment(text) {
    const positive = ['开心', '好', '棒', '喜欢', '爱', '哈哈', '😊', '😄', '✨', '耶', '太好了', '不错'];
    const negative = ['难过', '累', '烦', '失眠', '焦虑', '难', '哭', '怎么办', '😢', '😞', '崩了', '不行'];

    let score = 0;
    for (const w of positive) if (text.includes(w)) score += 0.3;
    for (const w of negative) if (text.includes(w)) score -= 0.3;
    return clamp(score, -1, 1);
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
