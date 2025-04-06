import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";

// Firebase 設定（login.htmlと同じ設定を使用）
const firebaseConfig = {
    apiKey: "AIzaSyCGsox95fxZh4J4ZQz4pm2o2_YwXUbXcaU",
    authDomain: "fudaoxiang-chat.firebaseapp.com",
    projectId: "fudaoxiang-chat",
    storageBucket: "fudaoxiang-chat.firebasestorage.app",
    messagingSenderId: "1008159058306",
    appId: "1:1008159058306:web:4ba3fd0ed4595a09ac479b",
    measurementId: "G-EWMWZBX4TT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 認証状態の監視
onAuthStateChanged(auth, (user) => {
  if (user) {
    // ユーザーがログインしている場合
    console.log("ログイン中のユーザー:", user.uid);
    // カメラ起動などの初期化処理を実行
    initializeCameraApp(); 
  } else {
    // ユーザーがログインしていない場合
    console.log("ユーザーはログインしていません。ログインページにリダイレクトします。");
    window.location.href = "login.html";
  }
});

// カメラアプリの初期化処理を関数にまとめる
function initializeCameraApp() {
    console.log("カメラアプリを初期化します。");
    // 元々あったカメラ関連の処理をここに入れる
    const video = document.getElementById('camera');
    const captureButton = document.getElementById('capture-button');
    const canvas = document.getElementById('canvas');
    const capturedImage = document.getElementById('captured-image');
    const context = canvas.getContext('2d');

    // カメラへのアクセス
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment', // 背面カメラを使用
                    width: { ideal: 1920 }, // iPhone SEの解像度に合わせて調整可能
                    height: { ideal: 1080 }
                }, 
                audio: false 
            });
            video.srcObject = stream;
        } catch (err) {
            console.error("カメラへのアクセスに失敗しました: ", err);
            alert("カメラへのアクセス許可が必要です。");
        }
    }

    // ページ読み込み時にカメラを開始 → initializeCameraApp内での呼び出しに変更
    startCamera();

    // 撮影ボタンの処理
    captureButton.addEventListener('click', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/png');
        capturedImage.src = imageDataUrl;
        capturedImage.style.display = 'block'; 
        video.style.display = 'none'; 
        captureButton.style.display = 'none'; // 撮影ボタンを非表示

        saveImageLocally(imageDataUrl);

        // 撮り直しボタンを表示
        showRetryButton();
    });

    // ローカル保存関数
    function saveImageLocally(imageDataUrl) {
        console.log("画像をローカルに保存...");
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = `captured_image_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log("画像ダウンロードリンクをクリックしました。");
        // addRetryButton呼び出しは不要
    }

    // グローバル変数（またはinitializeCameraAppスコープ内）でretryButtonを保持
    let retryButton = null;

    // 撮り直しボタンを作成・追加する関数 (初期化時に一度だけ呼ぶ)
    function createRetryButton() {
        if (!retryButton) { // まだ作成されていなければ
            retryButton = document.createElement('button');
            retryButton.id = 'retry-button';
            retryButton.textContent = '撮り直す';
            retryButton.style.display = 'none'; // 初期状態は非表示
            retryButton.addEventListener('click', () => {
                video.style.display = 'block';
                captureButton.style.display = 'inline-block'; // CSSで指定したdisplay値に戻す
                capturedImage.style.display = 'none';
                retryButton.style.display = 'none';
            });

            const buttonContainer = document.querySelector('.button-container');
            if (buttonContainer) {
                buttonContainer.appendChild(retryButton);
            }
        }
    }

    // 撮り直しボタンを表示する関数
    function showRetryButton() {
        if (retryButton) {
            retryButton.style.display = 'inline-block'; // CSSで指定したdisplay値に戻す
        }
    }

    // アプリ初期化時に撮り直しボタンを作成
    createRetryButton();
}

// 元のグローバルスコープにあった処理は initializeCameraApp 内に移動
// const video = ...
// const captureButton = ...
// ...
// startCamera();
// captureButton.addEventListener(...); 