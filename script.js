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

        // imageDataUrlを後でダウンロードボタンで使えるように保持
        window.latestImageDataUrl = imageDataUrl; // グローバル変数を使う例（スコープを考慮して改善可能）

        // 撮り直しボタンとダウンロードボタンを表示
        showActionButtons();
    });

    // ローカル保存関数 (ダウンロードボタンから呼ばれる)
    function saveImageLocally(imageDataUrl) {
        if (!imageDataUrl) {
            console.error("ダウンロードする画像データがありません。");
            return;
        }
        console.log("画像をローカルに保存...");
        const link = document.createElement('a');

        // Data URIをBlobに変換
        const blob = dataURItoBlob(imageDataUrl);
        // BlobからObject URLを生成
        const blobUrl = URL.createObjectURL(blob);

        link.href = blobUrl;
        link.download = `captured_image_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 重要: Object URLを解放する
        URL.revokeObjectURL(blobUrl);

        console.log("画像ダウンロードリンクをクリックしました。");
    }

    // Data URIをBlobに変換するヘルパー関数
    function dataURItoBlob(dataURI) {
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
    }

    // グローバル変数（またはinitializeCameraAppスコープ内）でボタンを保持
    let retryButton = null;
    let downloadButton = null;

    // 撮り直しボタンを作成・追加する関数
    function createRetryButton() {
        if (!retryButton) {
            retryButton = document.createElement('button');
            retryButton.id = 'retry-button';
            retryButton.textContent = '撮り直す';
            retryButton.style.display = 'none';
            retryButton.addEventListener('click', () => {
                video.style.display = 'block';
                captureButton.style.display = 'inline-block'; 
                capturedImage.style.display = 'none';
                retryButton.style.display = 'none';
                downloadButton.style.display = 'none'; // ダウンロードボタンも隠す
            });
            // ボタンコンテナに追加 (createDownloadButtonと共通化も可能)
            const buttonContainer = document.querySelector('.button-container');
            if (buttonContainer) {
                buttonContainer.appendChild(retryButton);
            }
        }
    }

    // ダウンロードボタンを作成・追加する関数
    function createDownloadButton() {
        if (!downloadButton) {
            downloadButton = document.createElement('button');
            downloadButton.id = 'download-button';
            downloadButton.textContent = 'ダウンロード';
            downloadButton.style.display = 'none';
            downloadButton.addEventListener('click', () => {
                // 保持しておいた画像データをダウンロード
                saveImageLocally(window.latestImageDataUrl);
            });
            // ボタンコンテナに追加
            const buttonContainer = document.querySelector('.button-container');
            if (buttonContainer) {
                buttonContainer.appendChild(downloadButton);
            }
        }
    }

    // 撮り直しボタンとダウンロードボタンを表示する関数
    function showActionButtons() {
        if (retryButton) {
            retryButton.style.display = 'inline-block'; 
        }
        if (downloadButton) {
            downloadButton.style.display = 'inline-block';
        }
    }

    // アプリ初期化時にボタンを作成
    createRetryButton();
    createDownloadButton();
}

// 元のグローバルスコープにあった処理は initializeCameraApp 内に移動
// const video = ...
// const captureButton = ...
// ...
// startCamera();
// captureButton.addEventListener(...); 