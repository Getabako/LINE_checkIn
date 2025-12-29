# みんなの体育館ASP - チェックインアプリ

施設のオンライン予約・チェックインシステム。LINE Payで決済後、4桁の暗証番号が発行され、電子ロックで入館できます。

## 機能

- 施設選択（体育館 / トレーニングジム）
- 日時・利用時間選択
- リアルタイム料金計算
- LINE Pay決済
- 4桁暗証番号発行
- 予約履歴確認・キャンセル

## 料金表（税込）

### 体育館
| 時間帯 | 平日 | 土日祝 |
|--------|------|--------|
| 07:00-17:00 | ¥2,750/h | ¥2,750/h |
| 17:00-21:00 | ¥2,200/h | ¥2,750/h |

### トレーニングジム
| 時間帯 | 全日 |
|--------|------|
| 07:00-21:00 | ¥2,200/h |

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite
- **スタイリング**: Tailwind CSS
- **状態管理**: Zustand
- **バックエンド**: Vercel Serverless Functions
- **データベース**: Neon PostgreSQL + Prisma
- **決済**: LINE Pay

## セットアップ

### 1. 依存関係インストール

```bash
npm install
```

### 2. 環境変数設定

`.env.example`を`.env`にコピーして設定：

```bash
cp .env.example .env
```

### 3. データベースセットアップ

```bash
npx prisma generate
npx prisma db push
```

### 4. 開発サーバー起動

```bash
npm run dev
```

http://localhost:3000 でアクセス

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `VITE_LIFF_ID` | LIFF ID |
| `DATABASE_URL` | PostgreSQL接続URL（Pooled） |
| `DATABASE_URL_UNPOOLED` | PostgreSQL接続URL（Direct） |
| `LINE_PAY_CHANNEL_ID` | LINE Pay Channel ID |
| `LINE_PAY_CHANNEL_SECRET` | LINE Pay Channel Secret |
| `LINE_PAY_SANDBOX` | Sandbox環境使用（true/false） |
| `NEXT_PUBLIC_BASE_URL` | アプリのベースURL |

## デプロイ

1. GitHubにプッシュ
2. Vercelでインポート
3. Neon PostgreSQLを追加（Storage → Neon）
4. 環境変数を設定
5. デプロイ完了

## フロー

```
1. アプリ起動 → 施設選択
2. 日時・利用時間を選択
3. 料金確認 → LINE Pay決済
4. 決済完了 → 4桁暗証番号発行
5. 施設入口で暗証番号入力 → 入館
```
