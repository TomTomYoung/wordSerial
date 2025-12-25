# Word Serial Lab

日本語テキスト処理のためのWebアプリケーション

## 機能

- JSON形式の単語リスト（Bag）のインポート
- 正規化処理（NFKC、かな変換）
- 集合演算（和集合、差集合、積集合）
- 単語の編集・管理

## セットアップ

### ローカル開発の場合

1. リポジトリをクローン:
   ```bash
   git clone https://github.com/TomTomYoung/wordSerial.git
   cd wordSerial
   ```

2. Kuromoji辞書ファイルをダウンロード:
   ```bash
   ./download-dict.sh
   ```

3. ローカルサーバーを起動:
   ```bash
   # Python 3の場合
   python3 -m http.server 8000

   # または Node.jsのhttp-serverを使用
   npx http-server
   ```

4. ブラウザで `http://localhost:8000` を開く

### GitHub Pagesデプロイ

GitHub Actionsワークフローが自動的に:
- Kuromoji辞書ファイルをダウンロード
- GitHub Pagesにデプロイ

masterブランチにプッシュすると自動的にデプロイされます。

## 技術スタック

- **Kuroshiro**: 日本語テキストのかな変換
- **Kuromoji.js**: 形態素解析
- **WanaKana**: かな・ローマ字変換のフォールバック

## 既知の問題

### Kuromoji辞書読み込みエラー

Kuromoji.jsには外部URLから辞書を読み込む際のバグがあります（[Issue #37](https://github.com/takuyaa/kuromoji.js/issues/37)）。このプロジェクトでは、辞書ファイルをローカルホストすることで回避しています。

## ライセンス

MIT
