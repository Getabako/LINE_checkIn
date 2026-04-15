# みんなの体育館 - チェックインアプリ

施設のオンライン予約・チェックインシステム。Stripe決済後、4桁の暗証番号が発行され、RemoteLockスマートロックで入館できます。

## 対応拠点

- **ASP** (みんなの体育館ASP)
- **YABASE** (みんなの体育館やばせ)

## 機能

- 拠点選択（ASP / やばせ）
- 施設選択（体育館 / トレーニングジム / 個室トレーニング）
- 日時・利用時間選択
- リアルタイム料金計算（平日昼・夜・土日祝で変動）
- クーポンコード適用
- 会員種別による料金割引
- Stripe Checkout決済
- RemoteLockスマートロック 暗証番号自動発行
- レビュー投稿

## 料金表（税込）

### ASP
| 施設 | 平日昼(8-17時) | 平日夜(17-21時) | 土日祝 |
|------|---------------|----------------|--------|
| 体育館 | ¥2,200/h | ¥2,750/h | ¥2,750/h |
| 個室トレーニング | ¥2,200/h | ¥2,200/h | ¥2,200/h |
| 共用トレーニング | ¥550/人 | ¥550/人 | ¥550/人 |

### やばせ
| 施設 | 平日昼(7-17時) | 平日夜(17-21時) | 土日祝 |
|------|---------------|----------------|--------|
| 体育館 | ¥1,650/h | ¥2,200/h | ¥2,200/h |

## 技術スタック

- **フロントエンド**: React 18 + TypeScript + Vite
- **スタイリング**: Tailwind CSS
- **状態管理**: Zustand
- **バックエンド**: Vercel Serverless Functions
- **データベース**: Firebase Firestore
- **決済**: Stripe Checkout
- **スマートロック**: RemoteLock API

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

### 3. Firebase設定

1. Firebase Consoleでプロジェクト作成
2. Firestoreデータベースを有効化
3. サービスアカウントキーをダウンロード
4. Base64エンコードして `FIREBASE_SERVICE_ACCOUNT_KEY` に設定

```bash
cat your-service-account.json | base64 | tr -d '\n' | pbcopy
```

### 4. 開発サーバー起動

```bash
npm run dev
```

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `VITE_LIFF_ID` | LINE LIFF ID |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase サービスアカウントJSON（Base64） |
| `STRIPE_SECRET_KEY` | Stripe シークレットキー |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook シークレット |
| `REMOTELOCK_CLIENT_ID` | RemoteLock OAuth Client ID |
| `REMOTELOCK_CLIENT_SECRET` | RemoteLock OAuth Client Secret |
| `REMOTELOCK_DEVICE_ID_ENTRANCE` | RemoteLock 玄関デバイスID |
| `REMOTELOCK_DEVICE_ID_GYM` | RemoteLock 体育館デバイスID |
| `REMOTELOCK_DEVICE_ID_TRAINING` | RemoteLock トレーニング室デバイスID |
| `VITE_APP_URL` | アプリのベースURL |

## デプロイ

1. GitHubにプッシュ
2. Vercelでインポート
3. 環境変数を設定（上記参照）
4. デプロイ完了

## Firestoreコレクション

| コレクション | 用途 |
|-------------|------|
| `users` | ユーザー情報 |
| `checkins` | チェックイン・予約データ |
| `coupons` | クーポンマスタ |
| `couponRedemptions` | クーポン利用履歴 |
| `memberTypes` | 会員種別マスタ |
| `userMemberships` | ユーザー会員紐付け |
| `reviews` | レビュー |
