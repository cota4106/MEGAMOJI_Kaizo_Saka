export type CellSuggestion = {
  h: number;
  v: number;
  cells: number;
  // 1マスあたりの縦横比が正方形からどれだけずれているか(0が完全な正方形)
  distortion: number;
};

const MAX_AXIS = 6; // 片方向あたりの最大分割数(これ以上は選択肢に出さない)
const MAX_CELLS = 20; // 合計マス数の上限(増えすぎると不便なため)
// これ以下の歪みなら「見た目に違和感が出にくい」とみなす目安値
// (1マスの縦横比が正方形に対して±15%以内)
const ACCEPTABLE_DISTORTION = 0.15;
const SUGGESTION_COUNT = 3;

/**
 * 分割後の1マスがどれくらい正方形からずれるかを計算する。
 * 0に近いほど歪みが少ない(Slack/Discordの正方形アイコン枠に収めたときに違和感が出にくい)。
 */
function cellDistortion(aspect: number, h: number, v: number): number {
  const cellAspect = (aspect * v) / h; // (width/h) / (height/v)
  return Math.max(cellAspect, 1 / cellAspect) - 1;
}

/**
 * targetAspect(画像全体の横 / 縦)から、歪みが出にくい分割数(h x v)をいくつか提案する。
 * 「歪みが全くない」ではなく「歪みが目立ちにくい」を基準にしつつ、
 * マス数が増えすぎて不便にならないよう、少ないマス数を優先する。
 */
export function suggestCellGrids(aspect: number): CellSuggestion[] {
  const candidates: CellSuggestion[] = [];
  for (let h = 1; h <= MAX_AXIS; h += 1) {
    for (let v = 1; v <= MAX_AXIS; v += 1) {
      const cells = h * v;
      if (cells > MAX_CELLS) {
        continue;
      }
      candidates.push({ h, v, cells, distortion: cellDistortion(aspect, h, v) });
    }
  }

  // 1x1(分割なし)は「提案」する意味が薄いので候補からは除外する
  const splitCandidates = candidates.filter((c) => c.cells > 1);

  const acceptable = splitCandidates.filter((c) => c.distortion <= ACCEPTABLE_DISTORTION);
  // 許容範囲内の候補があればそこから、無ければ全候補から選ぶ(歪みが一番少ないものを優先しつつ提案はする)
  const pool = acceptable.length > 0 ? acceptable : splitCandidates;

  // マス数が少ない順 → 同じマス数なら歪みが少ない順、で並べる
  pool.sort((a, b) => (a.cells - b.cells) || (a.distortion - b.distortion));

  // 同じ(h, v)の組み合わせが重複しないようにしつつ、上位いくつかだけ返す
  const seen = new Set<string>();
  const result: CellSuggestion[] = [];
  pool.forEach((c) => {
    const key = `${c.h}x${c.v}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    if (result.length < SUGGESTION_COUNT) {
      result.push(c);
    }
  });

  return result;
}
