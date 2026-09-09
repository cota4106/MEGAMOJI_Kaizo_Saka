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

    // タイルごとに固定のランダム値
    vec2 rnd = random2vec(tileIndex);

    // 崩れた瞬間に中心から少しだけ外側へ弾ける横方向のばらつき(控えめ)
    vec2 outward = normalize(tileCenter - vec2(0.5) + vec2(0.0001));
    float horizontalJitter = (rnd.x - 0.5) * 0.5;
    float horizontal = outward.x * 0.2 + horizontalJitter;

    // 縦方向は重力に従って加速しながら落ちる(keyframeの2乗で加速度的に)
    float fallSpeed = 1.1 + rnd.y * 1.0;

    vec2 offset;
    offset.x = horizontal * strength * keyframe;
    offset.y = fallSpeed * strength * keyframe * keyframe;

    vec2 sampleUv = vUv - offset;

    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // 落ちきったタイルは徐々に透明にする(重力落下に合わせて少し長めに見えるよう調整)
    float alpha = 1.0 - smoothstep(0.75, 1.0, keyframe);

    vec4 color = texture2D(texture, sampleUv);
    gl_FragColor = vec4(color.rgb, color.a * alpha);
}
