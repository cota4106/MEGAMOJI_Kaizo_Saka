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

    // タイルごとに固定のランダム値(飛ぶ方向・速度のばらつき)
    vec2 rnd = random2vec(tileIndex);
    vec2 dir = normalize(rnd - 0.5 + vec2(0.0001)); // 全方向にランダムな向き
    float speed = 0.3 + rnd.x * 0.5;

    // 横方向はランダムな向きに直進、縦方向は重力で加速しながら落ちる
    vec2 offset = dir * speed * strength * keyframe;
    offset.y += 0.4 * strength * keyframe * keyframe;

    vec2 sampleUv = vUv - offset;

    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // 飛び散りきったタイルは徐々に透明にする
    float alpha = 1.0 - smoothstep(0.6, 1.0, keyframe);

    vec4 color = texture2D(texture, sampleUv);
    gl_FragColor = vec4(color.rgb, color.a * alpha);
}
