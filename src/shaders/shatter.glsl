precision highp float;
uniform sampler2D texture;
varying vec2 vUv;

uniform float keyframe;
uniform float gridSize;   // 分割の細かさ(縦横のマス数)
uniform float strength;   // 飛び散る強さ

@include "./utils/random2.glsl"
@include "./utils/random2vec.glsl"

void main(void) {
    // このピクセルがどのタイルに属するか
    vec2 tileIndex = floor(vUv * gridSize);
    vec2 tileCenter = (tileIndex + 0.5) / gridSize;
    float tileHalfSize = 0.5 / gridSize;

    // タイルごとに固定のランダム値(3系統: 向き・初速、回転)
    vec2 rnd = random2vec(tileIndex);
    vec2 rnd2 = random2vec(tileIndex + vec2(13.7, 27.3));
    vec2 rnd3 = random2vec(tileIndex + vec2(51.3, 7.9));

    // 紙吹雪のように、全方向へ弾け飛ぶ(中心からの向き + ランダム性)
    vec2 outward = normalize(tileCenter - vec2(0.5) + vec2(0.0001));
    vec2 randomDir = normalize(rnd - 0.5 + vec2(0.0001));
    vec2 burstDir = normalize(outward + randomDir * 1.5);

    // フェーズ1「破裂して少し飛ぶ」: 最初は勢いよく中心から飛び出し、
    // すぐに減速して(指数関数的に頭打ちになり)一定距離で飛ぶのをやめる
    float burstDistance = 0.22 + rnd2.x * 0.18;
    float burstProgress = 1.0 - exp(-4.0 * keyframe); // 0→1へ素早く到達
    vec2 burstOffset = burstDir * burstDistance * burstProgress * strength;

    // フェーズ2「紙吹雪のように落ちていく」: 重力でゆっくり加速しながら落下
    float fallSpeed = 0.35 + rnd2.y * 0.3;
    float fallOffset = fallSpeed * keyframe * keyframe * strength;

    vec2 translation = burstOffset;
    translation.y += fallOffset;

    // 紙吹雪のように、破片ごとにクルクルと回転しながら落ちる(最初から最後まで回り続ける)
    float rotationSpeed = (rnd3.x - 0.5) * 7.0; // 正負ランダムな向き・速さ
    float angle = rotationSpeed * keyframe;
    float s = sin(angle);
    float c = cos(angle);

    // 表示位置(vUv)が、今の(移動した)破片の中でどこにあたるか
    vec2 displacedCenter = tileCenter + translation;
    vec2 localOffset = vUv - displacedCenter;

    // 回転を打ち消して、テクスチャ上での本来の位置に変換する
    vec2 unrotatedLocalOffset = vec2(
        c * localOffset.x + s * localOffset.y,
        -s * localOffset.x + c * localOffset.y
    );

    vec2 sampleUv = tileCenter + unrotatedLocalOffset;

    // 回転後、元の(正方形の)タイルの範囲からはみ出した部分は透明にする
    // (これによって出力側では「回転した正方形の破片」に見える)
    if (
        abs(unrotatedLocalOffset.x) > tileHalfSize ||
        abs(unrotatedLocalOffset.y) > tileHalfSize ||
        sampleUv.x < 0.0 || sampleUv.x > 1.0 ||
        sampleUv.y < 0.0 || sampleUv.y > 1.0
    ) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // 飛び散りきったタイルは徐々に透明にする
    float alpha = 1.0 - smoothstep(0.75, 1.0, keyframe);

    vec4 color = texture2D(texture, sampleUv);
    gl_FragColor = vec4(color.rgb, color.a * alpha);
}
