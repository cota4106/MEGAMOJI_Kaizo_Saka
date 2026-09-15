precision highp float;
uniform sampler2D texture;
varying vec2 vUv;

uniform float keyframe;
uniform float gridSize;   // 紙吹雪パーツの細かさ(縦横のマス数)
uniform float strength;   // 飛び散る強さ

@include "./utils/random2.glsl"
@include "./utils/random2vec.glsl"

const int MAX_GRID = 20;

// 指定したマス(tileIndex)が、今このピクセル(vUv)の位置に来ているかどうかを調べ、
// 来ていればそのマスの色(元画像のそのマス中心の色)を返す
vec4 particleColorIfHere(vec2 tileIndex, float tileHalfSize) {
    vec2 tileCenter = (tileIndex + 0.5) / gridSize;
    vec2 rnd = random2vec(tileIndex);
    vec2 rnd2 = random2vec(tileIndex + vec2(13.7, 27.3));
    vec2 rnd3 = random2vec(tileIndex + vec2(51.3, 7.9));

    // ほぼ最初のコマで、画面全体(はみ出すくらい広い範囲)に飛び散りきる
    vec2 scatterTarget = (rnd - 0.5) * 1.7 * strength;
    float scatterProgress = 1.0 - exp(-30.0 * keyframe);

    // 飛び散った後は、紙吹雪が風に流されるようにゆっくり下・横に漂う
    vec2 driftDir = normalize(vec2(rnd2.x - 0.5, 0.7) + vec2(0.0001));
    float driftSpeed = (0.15 + rnd2.y * 0.25) * strength;

    vec2 translation = scatterTarget * scatterProgress + driftDir * driftSpeed * keyframe;

    // 半分は正方形、半分は45度回した「ひし形」に。ゆっくり回転もする
    float baseRotation = rnd3.y > 0.5 ? 0.785398 : 0.0;
    float rotationSpeed = (rnd3.x - 0.5) * 2.2;
    float angle = baseRotation + rotationSpeed * keyframe;
    float s = sin(angle);
    float c = cos(angle);

    vec2 displacedCenter = tileCenter + translation;
    vec2 localOffset = vUv - displacedCenter;
    vec2 unrotatedLocalOffset = vec2(
        c * localOffset.x + s * localOffset.y,
        -s * localOffset.x + c * localOffset.y
    );

    float particleScale = 0.72; // 少し小さめの粒にして隙間を作る
    vec2 particleLocal = unrotatedLocalOffset / particleScale;

    if (abs(particleLocal.x) > tileHalfSize || abs(particleLocal.y) > tileHalfSize) {
        return vec4(0.0);
    }
    return texture2D(texture, tileCenter);
}

void main(void) {
    float tileHalfSize = 0.5 / gridSize;
    vec4 confettiColor = vec4(0.0);

    // 全てのマスについて「今この位置に来ているか」を確認する
    // (紙吹雪は元の位置から大きく移動するため、自分のマスだけを見る方式では
    //  ほとんど何も表示されなくなってしまう)
    for (int iy = 0; iy < MAX_GRID; iy += 1) {
        if (float(iy) >= gridSize) break;
        for (int ix = 0; ix < MAX_GRID; ix += 1) {
            if (float(ix) >= gridSize) break;
            vec4 c = particleColorIfHere(vec2(float(ix), float(iy)), tileHalfSize);
            if (c.a > 0.0) {
                confettiColor = c;
            }
        }
    }

    // 元の絵から紙吹雪への切り替えは一瞬(ごく短いkeyframeの範囲)で行う
    float mixFactor = smoothstep(0.0, 0.05, keyframe);
    // 終盤は自然に見えなくなるようフェードアウトさせる
    float fadeOut = 1.0 - smoothstep(0.85, 1.0, keyframe);

    vec4 originalColor = texture2D(texture, vUv);
    vec3 rgb = mix(originalColor.rgb, confettiColor.rgb, mixFactor);
    float alpha = mix(originalColor.a, confettiColor.a * fadeOut, mixFactor);

    gl_FragColor = vec4(rgb, alpha);
}
