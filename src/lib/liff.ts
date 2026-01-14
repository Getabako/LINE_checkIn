import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID;
const IS_DEV = import.meta.env.DEV;
const IS_PROD = import.meta.env.PROD;

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

const MOCK_PROFILE: LiffProfile = {
  userId: 'U_dev_user_12345',
  displayName: '開発ユーザー',
  pictureUrl: undefined,
};

let isInitialized = false;
let isMockMode = false;
let initError: Error | null = null;

export const initializeLiff = async (): Promise<LiffProfile | null> => {
  // 開発モードでLIFF_IDが未設定の場合のみモックモード
  if (IS_DEV && !LIFF_ID) {
    console.log('🔧 開発モード: LIFFをモックで動作します');
    isInitialized = true;
    isMockMode = true;
    return MOCK_PROFILE;
  }

  // 本番環境でLIFF_IDが未設定の場合はエラー
  if (IS_PROD && !LIFF_ID) {
    const error = new Error('LIFF_IDが設定されていません。Vercelの環境変数を確認してください。');
    initError = error;
    throw error;
  }

  if (isInitialized) {
    if (isMockMode) return MOCK_PROFILE;
    return getLiffProfile();
  }

  try {
    await liff.init({ liffId: LIFF_ID });
    isInitialized = true;

    // LINEアプリ内の場合は自動ログイン済み
    if (liff.isInClient()) {
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return new Promise(() => {});
      }
      return getLiffProfile();
    }

    // 外部ブラウザでログインしていない場合
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return new Promise(() => {});
    }

    return getLiffProfile();
  } catch (error) {
    console.error('LIFF initialization failed:', error);
    initError = error instanceof Error ? error : new Error('LIFF初期化エラー');

    // 開発モードのみモックモードで続行
    if (IS_DEV) {
      console.log('🔧 開発モード: LIFFエラーのためモックで続行します');
      isInitialized = true;
      isMockMode = true;
      initError = null;
      return MOCK_PROFILE;
    }

    // 本番環境ではエラーを投げる
    throw error;
  }
};

export const getLiffProfile = async (): Promise<LiffProfile | null> => {
  if (isMockMode) return MOCK_PROFILE;
  if (!liff.isLoggedIn()) return null;

  try {
    const profile = await liff.getProfile();
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    };
  } catch (error) {
    console.error('Failed to get profile:', error);
    return null;
  }
};

export const getAccessToken = (): string | null => {
  if (isMockMode) return 'mock-access-token-for-development';
  if (!liff.isLoggedIn()) return null;
  return liff.getAccessToken();
};

export const closeLiff = (): void => {
  if (isMockMode) return;
  if (liff.isInClient()) {
    liff.closeWindow();
  }
};

// LIFF環境内かどうかを判定
export const isInLiffClient = (): boolean => {
  if (isMockMode) return true;
  if (!isInitialized) return false;
  return liff.isInClient();
};

// モックモードかどうかを判定
export const isDevMockMode = (): boolean => {
  return isMockMode;
};

// 初期化エラーを取得
export const getInitError = (): Error | null => {
  return initError;
};

// ログイン状態を取得
export const isLoggedIn = (): boolean => {
  if (isMockMode) return true;
  if (!isInitialized) return false;
  return liff.isLoggedIn();
};
