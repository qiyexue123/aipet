# 🐾 AI Pet Engine

> 灵魂感 = 记得你（记忆）× 像它自己（人格）× 想着你（主动）× 注意到你（细节）

## 架构

```
aipet/
├── core/
│   ├── memory.js        # 分层记忆系统（短期/情节/核心人物模型）
│   ├── persona.js       # 人格引擎（价值观约束 + 关系阶段）
│   ├── proactive.js     # 主动触达调度器
│   ├── detail.js        # 细节捕捉器（情绪镜像 + 细节回响）
│   └── pet.js           # 主引擎（组合四个维度）
├── prompts/
│   ├── system.js        # System Prompt 构建器
│   └── personas/
│       └── longlong.js  # 傲娇小龙人格定义
├── demo/
│   └── chat.js          # 命令行 demo
├── package.json
└── README.md
```

## 快速开始

```bash
npm install
node demo/chat.js
```
