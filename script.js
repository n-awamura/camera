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
        // videoのサイズに合わせてcanvasのサイズを設定
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // canvasに現在のフレームを描画
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // canvasの内容を画像として取得し、img要素に表示
        const imageDataUrl = canvas.toDataURL('image/png');
        capturedImage.src = imageDataUrl;
        capturedImage.style.display = 'block'; // 撮影後画像を表示
        video.style.display = 'none'; // 撮影後ビデオを非表示（任意）
        captureButton.style.display = 'none'; // 撮影後ボタンを非表示（任意）

        // ローカル保存処理を呼び出す
        saveImageLocally(imageDataUrl);
        // uploadToGoogleDrive(imageDataUrl); // Google Driveアップロードは後で実装
    });

    // ローカル保存関数のプレースホルダー
    function saveImageLocally(imageDataUrl) {
        console.log("画像をローカルに保存します（未実装）");
        // TODO: ローカル保存処理を実装
        // 例: aタグを作成してクリックイベントを発火させる
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = `captured_image_${Date.now()}.png`; // ファイル名
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log("画像ダウンロードリンクをクリックしました。");

        // 必要であれば撮り直しボタンなどを表示
        addRetryButton();
    }

    // 撮り直しボタンを追加する関数（例）
    function addRetryButton() {
        let retryButton = document.getElementById('retry-button');
        if (!retryButton) {
            retryButton = document.createElement('button');
            retryButton.id = 'retry-button';
            retryButton.textContent = '撮り直す';
            retryButton.style.display = 'block';
            retryButton.style.marginTop = '10px';
            retryButton.addEventListener('click', () => {
                // 表示を元に戻す
                video.style.display = 'block';
                captureButton.style.display = 'block';
                capturedImage.style.display = 'none';
                retryButton.style.display = 'none'; // 撮り直しボタン自身も非表示に
            });
            // ボタンを適切な場所に追加 (例: captureButtonの後)
            captureButton.parentNode.insertBefore(retryButton, captureButton.nextSibling);
        }
        retryButton.style.display = 'block'; // 撮り直しボタンを表示
    }
}

// 元のグローバルスコープにあった処理は initializeCameraApp 内に移動
// const video = ...
// const captureButton = ...
// ...
// startCamera();
// captureButton.addEventListener(...); 