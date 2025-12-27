
// === 依存関数 (流れを追うために抜粋) ===

// 文字列正規化 (NFKC)
const normNFKC = s => (s || "").normalize('NFKC').trim();

async function ensureKuro() {
    if (kuroReady) return;
    K = new window.Kuroshiro();
    const Analyzer = window.Kuroshiro.Analyzer.KuromojiAnalyzer;
    await K.init(new Analyzer({ dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict' }));
    kuroReady = true;
}

// ひらがな変換 (Kuroshiro / WanaKana)
async function toHiragana(s) {
    if (!s) return '';
    try {
        await ensureKuro();
        return await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });
    } catch {
        return safeWanakanaConvert('toHiragana', normNFKC(s));
    }
}

// === メイン: op_normalize_hiragana ===

/* 
 * 使用と入力 (Input):
 * - srcBag: 処理元となる Bag オブジェクト。
 *   - srcBag.items: 処理対象の単語セット (Set<string>)
 *   - srcBag.name: Bag の名前
 *   - srcBag.id: Bag の ID
 */

/* 処理と出力 (Processing & Output) */
async function op_normalize_hiragana(srcBag) {
    const out = new Set();
    let i = 0;

    // 入力 Bag の全単語をループ処理
    for (const w of srcBag.items) {
        // 1. 各単語をひらがなに変換
        const h = await toHiragana(w);

        // 2. 変換結果があれば、空白を除去して出力セットに追加
        if (h) out.add(h.replace(/\s+/g, ''));

        // 3. UIフリーズ防止: 2000件ごとにメインスレッドに描画権を譲る
        if (++i % 2000 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // 出力: 新しい Bag オブジェクトを返却
    // - items: 変換された単語のセット
    // - meta: 操作履歴 (op, src, normalized)
    return new Bag(`${srcBag.name} → normalize(hiragana)`, out, { op: 'normalize_hiragana', src: srcBag.id, normalized: 'hiragana' });
}
