/**
 * chat.js — 命令行 Demo
 *
 * 运行：node demo/chat.js
 * 需要设置环境变量：OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
 */

import readline from 'readline';
import chalk from 'chalk';
import { AIPet } from '../core/pet.js';

// ── 初始化宠物 ─────────────────────────────────────────────
const pet = new AIPet({
  userId: 'demo-user',
  apiConfig: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
});

// ── 打印状态 ───────────────────────────────────────────────
function printStatus() {
  const status = pet.getStatus();
  console.log(chalk.gray('─'.repeat(50)));
  console.log(
    chalk.yellow(`${status.petEmoji} ${status.petName}`),
    chalk.gray(`| 关系：${status.stage} | 亲密度：${status.intimacy}`),
    chalk.gray(`| 心情：${status.mood}`)
  );
  if (status.daysSince > 0) {
    console.log(chalk.gray(`  上次见面：${status.daysSince} 天前`));
  }
  console.log(chalk.gray('─'.repeat(50)));
}

// ── 命令行交互 ─────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

printStatus();
console.log(chalk.gray('输入消息和龙龙聊天，输入 /status 查看状态，/quit 退出\n'));

function prompt() {
  rl.question(chalk.cyan('你：'), async (input) => {
    input = input.trim();
    if (!input) return prompt();

    if (input === '/quit') {
      pet.endSession();
      console.log(chalk.yellow('\n龙龙：……走了？（缩回去）\n'));
      rl.close();
      return;
    }

    if (input === '/status') {
      printStatus();
      return prompt();
    }

    if (input === '/memory') {
      const model = pet.memory.getUserModel();
      const episodes = pet.memory.recallEpisodes('', 5);
      console.log(chalk.gray('\n[记忆系统]'));
      console.log(chalk.gray('用户模型：'), JSON.stringify(model, null, 2));
      console.log(chalk.gray('情节记忆：'), episodes.map(e => `· ${e.content}`).join('\n'));
      console.log();
      return prompt();
    }

    try {
      process.stdout.write(chalk.yellow('🐲 '));
      const { reply, caughtDetails } = await pet.chat(input);

      console.log(chalk.yellow(reply));

      if (caughtDetails.length > 0) {
        console.log(chalk.gray(
          `  [捕捉到细节：${caughtDetails.map(d => d.tag).join('、')}]`
        ));
      }
      console.log();
    } catch (err) {
      console.error(chalk.red('出错了：'), err.message);
    }

    prompt();
  });
}

prompt();

// 退出时结束会话
process.on('SIGINT', () => {
  pet.endSession();
  console.log(chalk.yellow('\n\n龙龙：……（缩起来假装没发生）'));
  process.exit(0);
});
