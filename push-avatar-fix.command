#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock
git add src/app/api/ai/chat/route.ts src/components/ai/AiChatPanel.tsx src/components/ai/GlobalAiAvatar.tsx src/lib/ai-provider.ts
git commit -m "fix: restore avatar position + add Ollama/gemma4 model dropdown"
git push origin main
echo ""
echo "✅ Done — Vercel will deploy in ~1 min"
read -p "Press Enter to close..."
