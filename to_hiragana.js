
/**
 * ============================================================================
 * 1. INFRASTRUCTURE LAYER
 * File: assets/js/infra/kuro-wrapper.js
 * ============================================================================
 */

let _kuro = null;
let _initPromise = null;

// Kuroshiroの初期化を保証する関数
// シングルトンパターンで一度だけ初期化する
async function ensureKuro() {
    if (_kuro) return _kuro;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        // window.Kuroshiro (CDNロード) の待機
        if (!window.Kuroshiro) await new Promise(r => setTimeout(r, 500));

        let KuroshiroConstructor = window.Kuroshiro;
        if (typeof KuroshiroConstructor !== 'function' && KuroshiroConstructor?.default) {
            KuroshiroConstructor = KuroshiroConstructor.default;
        }

        // 辞書(KuromojiAnalyzer)のセットアップ
        let Analyzer = window.KuromojiAnalyzer || window.Kuroshiro.Analyzer?.KuromojiAnalyzer;
        const k = new KuroshiroConstructor();
        await k.init(new Analyzer({ dictPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }));
        _kuro = k;
        return k;
    })();
    return _initPromise;
}

function getK() {
    if (!_kuro) throw new Error("Kuroshiro not initialized. Call ensureKuro() first.");
    return _kuro;
}

// ひらがな変換のラップ関数
// 基本的なインターフェースを提供
async function toHiragana(s) {
    if (!s) return "";
    await ensureKuro();
    return _kuro.convert(s, { to: 'hiragana', mode: 'spaced' });
}


/**
 * ============================================================================
 * 2. CORE UTILITY LAYER
 * File: assets/js/core/utils.js
 * ============================================================================
 */

/**
 * processWithBatching
 * 大量のデータをチャンク（バッチ）に分割して処理し、合間でUIスレッドに制御を戻す（yielder）
 * 並列数（concurrency）を制御しながら processFn を実行する
 */
async function processWithBatching(items, processFn, { yielder, batchSize = 200, onChunk = null, concurrency = 5 } = {}) {
    // console.log(`[processWithBatching] Start. Items size: ${items instanceof Set ? items.size : items.length}`);
    const out = new Set();
    let chunkBuffer = [];

    const flushChunk = () => {
        if (onChunk && chunkBuffer.length) {
            onChunk(chunkBuffer);
            chunkBuffer = [];
        }
    };

    const itemsArray = Array.from(items);

    // バッチ単位（例: 200件ごと）にループ
    for (let i = 0; i < itemsArray.length; i += batchSize) {
        const batch = itemsArray.slice(i, i + batchSize);

        // バッチ内でさらに並列実行（例: 5件同時）
        for (let j = 0; j < batch.length; j += concurrency) {
            const concurrentBatch = batch.slice(j, j + concurrency);

            const results = await Promise.all(concurrentBatch.map(async (item) => {
                try {
                    return await processFn(item);
                } catch (e) {
                    return null;
                }
            }));

            // 結果の集約
            for (const res of results) {
                if (res !== null && res !== undefined) {
                    out.add(res);
                    if (onChunk) chunkBuffer.push(res);
                }
            }
        }

        // yield (waitFrame) を実行してUI描画の機会を作る
        if (yielder) {
            flushChunk();
            await yielder();
        }
    }
    flushChunk();
    return out;
}


/**
 * ============================================================================
 * 3. CORE LOGIC LAYER
 * File: assets/js/core/text.js
 * ============================================================================
 */

// NFKC正規化 (半角カナ→全角カナなど)
const normNFKC = s => (s || "").normalize('NFKC').trim();

// テキスト正規化のメインロジック
// processWithBatchingを使って、リスト全体に対して converter (この場合toHiragana) を適用する
async function normalize(items, _, hooks) {
    const { converter } = hooks;
    // processWithBatching を呼び出して処理を委譲
    return processWithBatching(items, async (w) => {
        // 個別の単語に対する処理
        const res = converter ? await converter(w) : w;
        return res ? res.replace(/\s+/g, '') : null;
    }, hooks);
}


/**
 * ============================================================================
 * 4. DOMAIN BASE LAYER
 * File: assets/js/domain/ops/base.js
 * ============================================================================
 */

// (Mock) Bag モデル
class Bag {
    constructor(name, items, meta) {
        this.name = name;
        this.items = new Set(items);
        this.meta = meta;
    }
    finish() { this.meta.status = 'ready'; }
    updateProgress(current, total) { /* UI update logic */ }
}

// (Mock) Registry
const REG = { add: (b) => { /* register bag */ }, notify: () => { } };

/**
 * runProgressiveOp
 * バックグラウンドで進行する操作（Progressive Operation）のテンプレート。
 * 'processing' 状態のBagを即座に返し、非同期で中身を埋めていく。
 */
async function runProgressiveOp(bagName, meta, logicFn, hooks = {}) {
    // 1. まず空のBagを作成 (status: processing)
    const bag = new Bag(bagName, [], { ...meta, status: 'processing' });
    REG.add(bag);

    // 2. 非同期で実処理を開始
    (async () => {
        try {
            console.log(`[Progressive] Start: ${bagName}`);
            let updateCount = 0;

            // チャンク単位でBagに追加するコールバック
            const onChunk = (chunk) => {
                for (const item of chunk) bag.items.add(item);
                // 進捗更新
                if (++updateCount % 10 === 0) {
                    bag.updateProgress(bag.items.size, 0);
                }
            };

            const combinedHooks = { ...hooks, onChunk };

            // 3. ロジック関数を実行 (ここで processWithBatching などが呼ばれる)
            await logicFn(combinedHooks);

            // 4. 完了処理
            console.log(`[Progressive] Finish: ${bagName}`);
            bag.finish();
            REG.notify();
        } catch (e) {
            console.error("Progressive Op Failed", e);
            bag.meta.status = 'error';
        }
    })();

    // 5. 処理中のBagを呼び出し元に即座に返す
    return bag;
}


/**
 * ============================================================================
 * 5. DOMAIN OPERATION LAYER (ENTRY POINT)
 * File: assets/js/domain/ops/normalize.js
 * ============================================================================
 */

// ユーザーアクションのエントリーポイント
// srcBag: 入力
// hooks: UI層から渡される { yielder, batchSize } など
async function op_normalize_hiragana(srcBag, { hooks } = {}) {
    console.log('[op_normalize_hiragana] Waiting for Kuro...');
    await ensureKuro();
    console.log('[op_normalize_hiragana] Kuro ready.');
    const K = getK();

    // 高速化のため、ラップ関数(toHiragana)を経由せずKuroshiroインスタンスを直接使うコンバータを定義
    const fastConverter = async (s) => await K.convert(normNFKC(s), { to: 'hiragana', mode: 'spaced' });

    // runProgressiveOp を呼び出し
    return runProgressiveOp(
        `${srcBag.name} → normalize(hiragana)`,
        { op: 'normalize_hiragana', src: srcBag.id, normalized: 'hiragana' },

        // 実処理を行う logicFn
        // ここでCore層の normalize 関数を呼び出す
        async (h) => {
            // core/text.js の normalize を呼び出す
            await normalize(srcBag.items, null, { ...h, converter: fastConverter });
        },
        hooks
    );
}
