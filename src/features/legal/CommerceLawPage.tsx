import React from 'react';
import { Header } from '../../components/common/Header';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 py-3 border-b border-gray-100 last:border-b-0">
    <div className="text-xs sm:text-sm font-semibold text-primary-800">{label}</div>
    <div className="sm:col-span-2 text-sm text-gray-700 whitespace-pre-wrap">{children}</div>
  </div>
);

export const CommerceLawPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="特定商取引法に基づく表記" showBack />

      <main className="p-4 pb-12">
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 p-5">
          <Row label="販売業者">株式会社Local Power</Row>
          <Row label="販売責任者">寺田耕也</Row>
          <Row label="所在地">
            〒010-0962{'\n'}秋田県秋田市八橋大畑2-3-1 White Cube 1F
          </Row>
          <Row label="会社HP">
            <a
              href="https://lpower.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 underline break-all"
            >
              https://lpower.jp/
            </a>
          </Row>
          <Row label="電話番号">018-838-6943</Row>
          <Row label="メールアドレス">mintai@lpower.jp</Row>
          <Row label="商品価格・その他必要費用">
            予約時の事前カード決済を基本としております。{'\n'}
            年間契約の場合は請求書による使用日に属する月末締、翌月末払いの請求書を発行し、振り込みでの支払いをお願いする場合もございます。
          </Row>
          <Row label="予約期限・商品等の引渡し時期">
            利用日時の1分前までご予約が可能です。{'\n'}
            予約日時に現地（やばせ店：八橋南2-8-2 ／ ASP店：八橋大畑1-3-20）にお越しいただき、電子キーに暗証番号を入力し、入室し、清掃後、予約時間内に施錠し、退室してください。
          </Row>
          <Row label="返品・キャンセル">
            予約日〜利用日の前日：無料{'\n'}
            利用日当日：100％{'\n'}
            ※当社の都合でキャンセルになった場合、速やかに全額返金します。
          </Row>
          <Row label="利用回数・定期利用の制限について">
            利用回数の制限はございません。{'\n'}
            また弊社と年間で契約し、週次で定期利用頂ける方へは250円/時の値引きをさせて頂きます。
          </Row>
          <Row label="商品代金以外に必要な料金">消費税が10％かかります。</Row>
        </div>
      </main>
    </div>
  );
};
