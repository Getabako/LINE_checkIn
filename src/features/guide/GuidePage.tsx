import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCalendar, FiXCircle, FiKey, FiFileText, FiRepeat, FiAward, FiHelpCircle } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div className="flex items-start gap-3">
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
      {n}
    </span>
    <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
  </div>
);

export const GuidePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#eef2f7]">
      <Header title="ご利用ガイド" showBack />

      <main className="p-4 pb-28 space-y-4">
        {/* 新規予約 */}
        <section className="panel animate-fade-in-up">
          <div className="panel-header">
            <FiCalendar className="w-4 h-4" />
            新規予約の流れ
          </div>
          <div className="panel-body space-y-3">
            <Step n={1}>トップページで拠点（やばせ／ASP）を選択します。施設の場所をお間違えのないようご注意ください。</Step>
            <Step n={2}>利用する施設（体育館／トレーニングルーム）を選択します。</Step>
            <Step n={3}>空き状況カレンダーから日付と開始時間をタップし、利用時間を選択します（予約は当日から90日先まで）。</Step>
            <Step n={4}>内容を確認し、クレジットカード等でお支払いすると予約が確定します。</Step>
            <Step n={5}>予約完了と同時に入館用の暗証番号（PINコード）が発行され、LINEにも通知されます。</Step>
          </div>
        </section>

        {/* 予約確認・キャンセル */}
        <section className="panel animate-fade-in-up">
          <div className="panel-header">
            <FiXCircle className="w-4 h-4" />
            予約の確認・キャンセル
          </div>
          <div className="panel-body space-y-3">
            <Step n={1}>「マイ予約」を開くと、予約・利用・キャンセルの履歴が確認できます。</Step>
            <Step n={2}>キャンセルは利用開始の1時間前まで可能です。決済済みの場合は自動で返金処理されます。</Step>
            <Step n={3}>時間や施設の変更は、一度キャンセルしてから取り直してください。</Step>
          </div>
        </section>

        {/* 入退館 */}
        <section className="panel animate-fade-in-up">
          <div className="panel-header">
            <FiKey className="w-4 h-4" />
            入館・退館の方法
          </div>
          <div className="panel-body space-y-3">
            <Step n={1}>予約完了画面またはLINE通知に記載の暗証番号（PINコード）を確認します。</Step>
            <Step n={2}>施設入口のドアキーにPINコードを入力して開錠します。</Step>
            <Step n={3}>退館時は端末のボタン（Lockstate）を押して施錠してください。</Step>
          </div>
        </section>

        {/* 領収書 */}
        <section className="panel animate-fade-in-up">
          <div className="panel-header">
            <FiFileText className="w-4 h-4" />
            領収書の発行
          </div>
          <div className="panel-body space-y-3">
            <Step n={1}>「マイ予約」の履歴から「領収書」ボタンをタップします。</Step>
            <Step n={2}>宛名を入力して、PDFのダウンロードまたはメール送信を選択できます。</Step>
          </div>
        </section>

        {/* 定期利用 */}
        <section className="panel animate-fade-in-up">
          <div className="panel-header">
            <FiRepeat className="w-4 h-4" />
            定期利用の方へ
          </div>
          <div className="panel-body space-y-3">
            <p className="text-sm text-gray-700 leading-relaxed">
              年間の定期予約は運営側でまとめて登録します。登録済みの予約は「マイ予約」に表示され、
              キャンセルは利用開始1時間前まで自分で行えます。追加予約は通常の予約フローから可能で、
              会員割引が自動適用されます（オンライン決済は発生せず、後日請求書払いとなります）。
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              更新・退会のご相談は公式アカウントまたは運営までご連絡ください。
            </p>
          </div>
        </section>

        {/* 会員区分 */}
        <section className="panel animate-fade-in-up">
          <div className="panel-header">
            <FiAward className="w-4 h-4" />
            会員区分・割引の申請
          </div>
          <div className="panel-body">
            <p className="text-sm text-gray-700 leading-relaxed">
              割引区分（定期利用・学生会員など）をご希望の方は、「マイ予約」内の会員区分カードから申請できます。
              運営の承認後、予約時に割引が自動適用されます。
            </p>
          </div>
        </section>

        {/* お問い合わせ */}
        <section className="panel animate-fade-in-up">
          <div className="panel-header">
            <FiHelpCircle className="w-4 h-4" />
            お問い合わせ
          </div>
          <div className="panel-body">
            <p className="text-sm text-gray-700 leading-relaxed">
              施設の不具合報告やご質問は、LINE公式アカウントのメニューからご連絡ください。
            </p>
          </div>
        </section>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30">
        <Button fullWidth onClick={() => navigate('/')}>
          トップへ戻る
        </Button>
      </div>
    </div>
  );
};
