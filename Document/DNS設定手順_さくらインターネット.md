# lpower.jp のDNS設定手順（領収書メールの送信元設定）

予約アプリから送る領収書メールの送信元を mintai@lpower.jp にするため、
lpower.jp のDNSにレコードを3件追加していただく作業です。所要10分ほどです。

## 事前にご安心いただきたい点

- 追加するのは認証用の行3件だけです。
  現在お使いのメール（さくらのメール送受信）やWebサイトには一切影響しません。
- 間違えた場合も、追加した行を削除すれば元通りです。

## 手順

1. さくらインターネットの会員メニュー（ https://secure.sakura.ad.jp/ ）にログインします。
2. 「契約中のドメイン一覧」（メニューでは「ドメイン/SSL」→「ドメイン一覧」）を開き、
   lpower.jp の「設定」または「ゾーン編集」をクリックします。
   ※一覧に「ゾーン編集」が見当たらない場合は、「さくらのドメインコントロールパネル」から
   lpower.jp を選び「ゾーン」タブを開いてください。
3. 「レコード追加」（＋ボタン）から、以下の3件を1件ずつ追加します。

### 1件目（TXTレコード・DKIM認証）
- エントリ名（ホスト名）: `resend._domainkey`
- 種別: TXT
- 値（下の1行をそのまま全部コピーして貼り付けてください）:

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDW4X1Hl2hQMpOWx/4FEe00BDJBNuFJndRVebaCcg+oo0YNG5NnP7t33Qub0S5vIlAZ7SDLfsPCXTZ7x2nRWXO5uJQeMBbl1c5IPF5M6TYUY9hohwYoYkmH8UaOf2RW4iBXJ2zBYokkTm48UhumIsAXeHAhSTs2Z3+Zi1Elr5CVCQIDAQAB
```

### 2件目（CNAMEレコード）
- エントリ名（ホスト名）: `rsend`
- 種別: CNAME
- 値: `rsend.forge.rmta.net.`
  （さくらでは末尾にピリオド「.」が必要です。エラーになる場合はピリオドを外してお試しください）

### 3件目（CNAMEレコード）
- エントリ名（ホスト名）: `send`
- 種別: CNAME
- 値: `send.forge.rmta.net.`
  （こちらも同様に末尾ピリオド付きで）

4. 「保存」を押して完了です。完了しましたら高崎までご一報ください。
   ※反映には数分〜最大数時間かかることがあります。こちらで認証の完了を確認し、
   テスト送信の結果をご連絡します。
