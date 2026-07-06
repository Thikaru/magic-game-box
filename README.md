# DAILY GAMES

毎朝6時に Claude Code Routines が新しいミニゲームを1本作って公開する静的サイト。

- トップページ = 本日のゲーム(タイトル + あそぶボタン → 説明画面から開始、何度でもリトライ可)
- `archive.html` = 過去の全ゲーム一覧(いつでも遊べる)
- ゲームは `games/YYYY-MM-DD-<slug>/` に1フォルダずつ完全独立で格納

## セットアップ手順

### 1. リポジトリを公開する

```bash
git init
git add .
git commit -m "initial: daily games starter"
# GitHubに新規リポジトリを作ってpush
git remote add origin https://github.com/<you>/daily-games.git
git push -u origin main
```

### 2. GitHub Pages を有効化

リポジトリの Settings → Pages → Source を
「Deploy from a branch / main / (root)」に設定。
`https://<you>.github.io/daily-games/` で公開されます。

### 3. ルーチン①「新規作成」を登録

1. https://claude.ai/code/routines を開き「New routine」
2. リポジトリにこのリポジトリを指定
3. トリガー: Schedule → 毎日 6:00(タイムゾーン Asia/Tokyo を確認)
4. プロンプト欄に `routines/new-game.md` の「---」以降を貼り付け
5. コネクタは全部外してOK

### 4. ルーチン②「修正」を登録

1. 同様に「New routine」
2. トリガー: GitHub event → Issues(opened)
3. プロンプト欄に `routines/fix-game.md` の「---」以降を貼り付け

修正したいときは GitHub に Issue を立てるだけ。
ルーチンが対象ゲームを特定して修正PRを作ります。

### 5. 自動マージについて

Routines は `claude/` プレフィックスのブランチにしかプッシュできないため、
`.github/workflows/automerge.yml` が `claude/**` の PR を自動マージして
サイトに反映します。**AI生成コードを無レビューでマージする構成**なので、
毎回目視したい場合はこのワークフローを削除して手動マージにしてください。

## 注意

- Routines はリサーチプレビュー機能で、1日の実行回数上限があります
  (Pro: 5回 / Max: 15回 / Team・Enterprise: 25回)。新規作成1回 + 修正数回なら十分です。
- ルーチンは毎回デフォルトブランチから新規クローンで実行されるため、
  プロンプトは自己完結している必要があります(規約は CLAUDE.md に集約済み)。
